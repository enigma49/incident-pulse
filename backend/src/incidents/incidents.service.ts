import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Incident,
  IncidentDocument,
  IncidentStatus,
  IncidentSeverity,
} from './schemas/incident.schema';
import { Alert, AlertDocument, AlertStatus } from '../alerts/schemas/alert.schema';
import { Comment, CommentDocument } from '../comments/schemas/comment.schema';
import { Task, TaskDocument } from '../tasks/schemas/task.schema';
import {
  AIInvestigation,
  AIInvestigationDocument,
} from '../ai/schemas/ai-investigation.schema';
import { AuditService } from '../audit/audit.service';
import { ActorType } from '../audit/schemas/audit-event.schema';
import {
  CreateIncidentDto,
  UpdateIncidentDto,
  AssignIncidentDto,
  RelateIncidentDto,
  MergeIncidentDto,
} from './dto/incident.dto';
import { QueryIncidentsDto } from './dto/query-incidents.dto';
import { RedisService, CACHE_KEYS, CACHE_TTLS } from '../common/redis/redis.service';
import { EventsGateway } from '../events/events.gateway';
import { IncidentRefService } from './incident-ref.service';
import { formatIncidentDisplayId, parseIncidentDisplayId } from './incident-id.util';
import { assertOperatorAssignmentAllowed } from './incident-assignment.policy';
import {
  correlationKeyForServices,
  mergeServices,
  normalizeServices,
} from './incident-services.util';

@Injectable()
export class IncidentsService implements OnModuleInit {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    @InjectModel(Incident.name) private incidentModel: Model<IncidentDocument>,
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectModel(AIInvestigation.name)
    private aiInvestigationModel: Model<AIInvestigationDocument>,
    private auditService: AuditService,
    private redisService: RedisService,
    private eventsGateway: EventsGateway,
    private incidentRefService: IncidentRefService,
  ) {}

  async onModuleInit() {
    await this.migrateLegacyServiceFields();
  }

  /**
   * One-time migration: legacy `service` + `affectedServices` → `services`.
   */
  private async migrateLegacyServiceFields() {
    const legacyFilter = {
      $or: [
        { services: { $exists: false } },
        { services: { $size: 0 } },
        { services: null },
      ],
    };

    const legacyCount = await this.incidentModel.countDocuments(legacyFilter).exec();
    if (legacyCount === 0) {
      return;
    }

    this.logger.log(
      `Migrating ${legacyCount} incident(s) from legacy service fields to services[]`,
    );

    const docs = await this.incidentModel.find(legacyFilter).lean().exec();
    for (const doc of docs) {
      const legacy = doc as any;
      const services = mergeServices(
        legacy.services,
        legacy.service,
        ...(Array.isArray(legacy.affectedServices) ? legacy.affectedServices : []),
      );
      if (services.length === 0) {
        continue;
      }
      await this.incidentModel.updateOne(
        { _id: legacy._id },
        {
          $set: { services },
          $unset: { service: '', affectedServices: '' },
        },
      );
    }
  }

  private severityWeight(severity: IncidentSeverity): number {
    switch (severity) {
      case IncidentSeverity.P1:
        return 1;
      case IncidentSeverity.P2:
        return 2;
      case IncidentSeverity.P3:
        return 3;
      case IncidentSeverity.P4:
        return 4;
      default: {
        const unexpected: never = severity;
        throw new Error(`Unexpected severity: ${unexpected}`);
      }
    }
  }

  private pickHigherSeverity(
    left: IncidentSeverity,
    right: IncidentSeverity,
  ): IncidentSeverity {
    return this.severityWeight(left) <= this.severityWeight(right) ? left : right;
  }

  private async loadRelatedIncidents(incident: IncidentDocument) {
    const relatedIds = incident.relatedIncidentIds || [];
    if (relatedIds.length === 0) {
      return [];
    }

    return this.incidentModel
      .find({ _id: { $in: relatedIds } })
      .select('incidentNumber title status severity services')
      .exec();
  }

  async create(dto: CreateIncidentDto, currentUser: any): Promise<IncidentDocument> {
    const services = normalizeServices(dto.services);
    if (services.length === 0) {
      throw new BadRequestException('At least one service is required');
    }

    assertOperatorAssignmentAllowed(
      currentUser,
      { teamId: dto.teamId, assigneeId: dto.assigneeId },
      { context: 'create' },
    );

    const incidentNumber = await this.incidentRefService.getNextIncidentNumber();
    const incident = new this.incidentModel({
      incidentNumber,
      title: dto.title,
      description: dto.description,
      severity: dto.severity,
      services,
      correlationKey: correlationKeyForServices(services),
      status: IncidentStatus.OPEN,
      teamId: dto.teamId ? new Types.ObjectId(dto.teamId) : null,
      assigneeId: dto.assigneeId ? new Types.ObjectId(dto.assigneeId) : null,
      tags: dto.tags || [],
    });

    const saved = await incident.save();

    await this.auditService.logEvent({
      incidentId: saved._id,
      actorType: currentUser?.role ? ActorType.USER : ActorType.SYSTEM,
      actorId: currentUser?.userId || currentUser?.email || 'system',
      action: 'INCIDENT_CREATED',
      entity: 'Incident',
      entityId: saved._id.toString(),
      metadata: {
        title: saved.title,
        severity: saved.severity,
        services: saved.services,
        status: saved.status,
      },
    });

    // Invalidate cached operations dashboard
    await this.redisService.invalidateDashboard();

    // Emit realtime event
    this.eventsGateway.emitIncidentCreated(saved);

    return saved;
  }

  async findAll(query: QueryIncidentsDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};

    if (query.status) {
      filter.status = query.status;
    } else if (query.excludeStatus) {
      filter.status = { $ne: query.excludeStatus };
    }
    if (query.severities) {
      const severityList = query.severities
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      if (severityList.length > 0) {
        filter.severity = { $in: severityList };
      }
    } else if (query.severity) {
      filter.severity = query.severity;
    }
    const orGroups: Record<string, any>[] = [];

    if (query.service) {
      filter.services = query.service;
    }
    if (query.teamId) {
      if (!Types.ObjectId.isValid(query.teamId)) {
        throw new BadRequestException(`Invalid teamId format: ${query.teamId}`);
      }
      filter.teamId = new Types.ObjectId(query.teamId);
    }
    if (query.assigneeId) {
      if (!Types.ObjectId.isValid(query.assigneeId)) {
        throw new BadRequestException(`Invalid assigneeId format: ${query.assigneeId}`);
      }
      filter.assigneeId = new Types.ObjectId(query.assigneeId);
    }

    if (query.fromDate || query.toDate) {
      filter.createdAt = {};
      if (query.fromDate) {
        filter.createdAt.$gte = new Date(query.fromDate);
      }
      if (query.toDate) {
        filter.createdAt.$lte = new Date(query.toDate);
      }
    }

    if (query.search && query.search.trim()) {
      const searchTerm = query.search.trim();
      const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escaped, 'i');
      const searchConditions: Record<string, any>[] = [
        { title: searchRegex },
        { description: searchRegex },
        { services: searchRegex },
      ];

      const incidentNumber = parseIncidentDisplayId(searchTerm);
      if (incidentNumber !== null) {
        searchConditions.push({ incidentNumber });
      }

      orGroups.push({ $or: searchConditions });
    }

    if (orGroups.length === 1) {
      Object.assign(filter, orGroups[0]);
    } else if (orGroups.length > 1) {
      filter.$and = orGroups;
    }

    // Database-level sorting & pagination
    const sortField = query.sortBy || 'createdAt';
    const sortDirection = query.sortOrder === 'asc' ? 1 : -1;
    const sortOptions: Record<string, any> = { [sortField]: sortDirection };

    const [total, data] = await Promise.all([
      this.incidentModel.countDocuments(filter).exec(),
      this.incidentModel
        .find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .populate('teamId', 'name serviceResponsibility')
        .populate('assigneeId', 'name email role')
        .exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findOne(id: string) {
    const incident = await this.incidentRefService.findByRefOrThrow(id);
    const objectId = incident._id.toString();
    const cacheKey = CACHE_KEYS.incidentDetail(objectId);

    // 1. Check Redis Cache
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) {
      this.logger.log(`Serving incident detail from Redis cache [${cacheKey}]`);
      return {
        ...cached,
        fromCache: true,
      };
    }

    this.logger.log(`Cache miss on [${cacheKey}]. Querying MongoDB...`);

    // 2. Fetch from MongoDB
    const populatedIncident = await this.incidentModel
      .findById(objectId)
      .populate('teamId', 'name serviceResponsibility')
      .populate('assigneeId', 'name email role')
      .exec();

    if (!populatedIncident) {
      throw new NotFoundException(`Incident ${formatIncidentDisplayId(incident.incidentNumber)} not found`);
    }

    const [alerts, tasks, comments, auditEvents, aiInvestigation] = await Promise.all([
      this.alertModel.find({ incidentId: populatedIncident._id }).sort({ timestamp: -1 }).exec(),
      this.taskModel
        .find({ incidentId: populatedIncident._id })
        .populate('assigneeId', 'name email')
        .sort({ createdAt: 1 })
        .exec(),
      this.commentModel
        .find({ incidentId: populatedIncident._id })
        .populate('userId', 'name email role')
        .sort({ createdAt: 1 })
        .exec(),
      this.auditService.findByIncidentId(objectId),
      this.aiInvestigationModel
        .findOne({ incidentId: populatedIncident._id })
        .sort({ createdAt: -1 })
        .exec(),
    ]);

    const [relatedIncidents, mergedInto] = await Promise.all([
      this.loadRelatedIncidents(populatedIncident),
      populatedIncident.mergedIntoId
        ? this.incidentModel
            .findById(populatedIncident.mergedIntoId)
            .select('incidentNumber title status severity services')
            .exec()
        : Promise.resolve(null),
    ]);

    const result = {
      incident: populatedIncident,
      relatedIncidents,
      mergedInto,
      alerts,
      tasks,
      comments,
      auditEvents,
      aiInvestigation,
      fromCache: false,
    };

    // 3. Cache in Redis (TTL: 15 seconds)
    await this.redisService.set(cacheKey, result, CACHE_TTLS.INCIDENT_DETAIL);

    return result;
  }

  async update(id: string, dto: UpdateIncidentDto, currentUser: any): Promise<IncidentDocument> {
    if (dto.teamId && !Types.ObjectId.isValid(dto.teamId)) {
      throw new BadRequestException(`Invalid teamId format: ${dto.teamId}`);
    }
    if (dto.assigneeId && !Types.ObjectId.isValid(dto.assigneeId)) {
      throw new BadRequestException(`Invalid assigneeId format: ${dto.assigneeId}`);
    }

    const existing = await this.incidentRefService.findByRefOrThrow(id);
    const objectId = existing._id.toString();

    assertOperatorAssignmentAllowed(
      currentUser,
      { teamId: dto.teamId, assigneeId: dto.assigneeId },
      {
        context: 'update',
        currentAssigneeId: existing.assigneeId?.toString() || null,
      },
    );

    const updates: Partial<Incident> = {};
    if (dto.title !== undefined) updates.title = dto.title;
    if (dto.description !== undefined) updates.description = dto.description;
    if (dto.services !== undefined) {
      const services = normalizeServices(dto.services);
      if (services.length === 0) {
        throw new BadRequestException('At least one service is required');
      }
      updates.services = services;
      updates.correlationKey = correlationKeyForServices(services);
    }
    if (dto.tags !== undefined) updates.tags = dto.tags;

    if (dto.teamId !== undefined) {
      updates.teamId = dto.teamId ? new Types.ObjectId(dto.teamId) : null;
    }
    if (dto.assigneeId !== undefined) {
      updates.assigneeId = dto.assigneeId ? new Types.ObjectId(dto.assigneeId) : null;
    }

    if (dto.status !== undefined && dto.status !== existing.status) {
      updates.status = dto.status;
      if (dto.status === IncidentStatus.RESOLVED) {
        updates.resolvedAt = new Date();
      } else {
        updates.resolvedAt = null;
      }
    }

    if (dto.severity !== undefined && dto.severity !== existing.severity) {
      updates.severity = dto.severity;
    }

    const updated = await this.incidentModel
      .findByIdAndUpdate(objectId, { $set: updates }, { new: true })
      .populate('teamId', 'name serviceResponsibility')
      .populate('assigneeId', 'name email role')
      .exec();

    if (!updated) {
      throw new NotFoundException(`Incident ${id} not found`);
    }

    await this.auditService.logEvent({
      incidentId: updated._id,
      actorType: currentUser?.role ? ActorType.USER : ActorType.SYSTEM,
      actorId: currentUser?.userId || currentUser?.email || 'system',
      action: 'INCIDENT_UPDATED',
      entity: 'Incident',
      entityId: updated._id.toString(),
      metadata: { updates },
    });

    // Invalidate incident detail and dashboard caches
    await this.redisService.invalidateIncident(objectId);

    // Emit realtime event
    this.eventsGateway.emitIncidentUpdated(updated);

    return updated;
  }

  async changeStatus(
    id: string,
    newStatus: IncidentStatus,
    currentUser: any,
  ): Promise<IncidentDocument> {
    const existing = await this.incidentRefService.findByRefOrThrow(id);
    const objectId = existing._id.toString();

    if (existing.status === newStatus) {
      return existing;
    }

    const oldStatus = existing.status;
    existing.status = newStatus;
    if (newStatus === IncidentStatus.RESOLVED) {
      existing.resolvedAt = new Date();
    } else {
      existing.resolvedAt = null;
    }

    const saved = await existing.save();

    await this.auditService.logEvent({
      incidentId: saved._id,
      actorType: currentUser?.role ? ActorType.USER : ActorType.SYSTEM,
      actorId: currentUser?.userId || currentUser?.email || 'system',
      action: 'STATUS_CHANGED',
      entity: 'Incident',
      entityId: saved._id.toString(),
      metadata: { oldStatus, newStatus },
    });

    // Invalidate caches
    await this.redisService.invalidateIncident(objectId);

    // Emit realtime event
    this.eventsGateway.emitIncidentStatusChanged(saved);

    return saved;
  }

  async changeSeverity(
    id: string,
    newSeverity: IncidentSeverity,
    currentUser: any,
  ): Promise<IncidentDocument> {
    const existing = await this.incidentRefService.findByRefOrThrow(id);
    const objectId = existing._id.toString();

    if (existing.severity === newSeverity) {
      return existing;
    }

    const oldSeverity = existing.severity;
    existing.severity = newSeverity;
    const saved = await existing.save();

    await this.auditService.logEvent({
      incidentId: saved._id,
      actorType: currentUser?.role ? ActorType.USER : ActorType.SYSTEM,
      actorId: currentUser?.userId || currentUser?.email || 'system',
      action: 'SEVERITY_CHANGED',
      entity: 'Incident',
      entityId: saved._id.toString(),
      metadata: { oldSeverity, newSeverity },
    });

    // Invalidate caches
    await this.redisService.invalidateIncident(objectId);

    // Emit realtime event
    this.eventsGateway.emitIncidentSeverityChanged(saved);

    return saved;
  }

  async assign(
    id: string,
    dto: AssignIncidentDto,
    currentUser: any,
  ): Promise<IncidentDocument> {
    if (dto.teamId && !Types.ObjectId.isValid(dto.teamId)) {
      throw new BadRequestException(`Invalid teamId format: ${dto.teamId}`);
    }
    if (dto.assigneeId && !Types.ObjectId.isValid(dto.assigneeId)) {
      throw new BadRequestException(`Invalid assigneeId format: ${dto.assigneeId}`);
    }

    const existing = await this.incidentRefService.findByRefOrThrow(id);
    const objectId = existing._id.toString();

    assertOperatorAssignmentAllowed(
      currentUser,
      { teamId: dto.teamId, assigneeId: dto.assigneeId },
      {
        context: 'assign',
        currentAssigneeId: existing.assigneeId?.toString() || null,
      },
    );

    if (dto.assigneeId !== undefined) {
      existing.assigneeId = dto.assigneeId ? new Types.ObjectId(dto.assigneeId) : null;
    }
    if (dto.teamId !== undefined) {
      existing.teamId = dto.teamId ? new Types.ObjectId(dto.teamId) : null;
    }

    const saved = await existing.save();

    await this.auditService.logEvent({
      incidentId: saved._id,
      actorType: currentUser?.role ? ActorType.USER : ActorType.SYSTEM,
      actorId: currentUser?.userId || currentUser?.email || 'system',
      action: 'INCIDENT_ASSIGNED',
      entity: 'Incident',
      entityId: saved._id.toString(),
      metadata: { assigneeId: dto.assigneeId, teamId: dto.teamId },
    });

    // Invalidate caches
    await this.redisService.invalidateIncident(objectId);

    const populated = await saved.populate([
      { path: 'teamId', select: 'name serviceResponsibility' },
      { path: 'assigneeId', select: 'name email role' },
    ]);

    // Emit realtime event
    this.eventsGateway.emitIncidentAssigned(populated);

    return populated;
  }

  async resolve(id: string, currentUser: any): Promise<IncidentDocument> {
    return this.changeStatus(id, IncidentStatus.RESOLVED, currentUser);
  }

  async relate(id: string, dto: RelateIncidentDto, currentUser: any) {
    const source = await this.incidentRefService.findByRefOrThrow(id);
    const target = await this.incidentRefService.findByRefOrThrow(dto.incidentId);

    if (source._id.equals(target._id)) {
      throw new BadRequestException('An incident cannot be related to itself');
    }

    if (
      source.status === IncidentStatus.RESOLVED &&
      target.status === IncidentStatus.RESOLVED
    ) {
      throw new BadRequestException('Cannot relate two resolved incidents');
    }

    const sourceRelated = new Set((source.relatedIncidentIds || []).map((value) => value.toString()));
    const targetRelated = new Set((target.relatedIncidentIds || []).map((value) => value.toString()));

    if (sourceRelated.has(target._id.toString()) || targetRelated.has(source._id.toString())) {
      throw new ConflictException('Incidents are already related');
    }

    source.relatedIncidentIds = [
      ...(source.relatedIncidentIds || []),
      target._id,
    ];
    target.relatedIncidentIds = [
      ...(target.relatedIncidentIds || []),
      source._id,
    ];

    await Promise.all([source.save(), target.save()]);

    await this.auditService.logEvent({
      incidentId: source._id,
      actorType: currentUser?.role ? ActorType.USER : ActorType.SYSTEM,
      actorId: currentUser?.userId || currentUser?.email || 'operator',
      action: 'INCIDENT_RELATED',
      entity: 'Incident',
      entityId: target._id.toString(),
      metadata: {
        sourceIncidentId: source._id.toString(),
        targetIncidentId: target._id.toString(),
      },
    });

    await this.redisService.invalidateIncident(source._id.toString());
    await this.redisService.invalidateIncident(target._id.toString());

    this.eventsGateway.emitIncidentUpdated(source);
    this.eventsGateway.emitIncidentUpdated(target);

    const relatedIncidents = await this.loadRelatedIncidents(source);
    return { incident: source, relatedIncidents };
  }

  async unrelate(id: string, relatedId: string, currentUser: any) {
    const source = await this.incidentRefService.findByRefOrThrow(id);
    const target = await this.incidentRefService.findByRefOrThrow(relatedId);

    source.relatedIncidentIds = (source.relatedIncidentIds || []).filter(
      (value) => !value.equals(target._id),
    );
    target.relatedIncidentIds = (target.relatedIncidentIds || []).filter(
      (value) => !value.equals(source._id),
    );

    await Promise.all([source.save(), target.save()]);

    await this.auditService.logEvent({
      incidentId: source._id,
      actorType: currentUser?.role ? ActorType.USER : ActorType.SYSTEM,
      actorId: currentUser?.userId || currentUser?.email || 'operator',
      action: 'INCIDENT_UNRELATED',
      entity: 'Incident',
      entityId: target._id.toString(),
      metadata: {
        sourceIncidentId: source._id.toString(),
        targetIncidentId: target._id.toString(),
      },
    });

    await this.redisService.invalidateIncident(source._id.toString());
    await this.redisService.invalidateIncident(target._id.toString());

    this.eventsGateway.emitIncidentUpdated(source);
    this.eventsGateway.emitIncidentUpdated(target);

    const relatedIncidents = await this.loadRelatedIncidents(source);
    return { incident: source, relatedIncidents };
  }

  async merge(id: string, dto: MergeIncidentDto, currentUser: any) {
    const source = await this.incidentRefService.findByRefOrThrow(id);
    const target = await this.incidentRefService.findByRefOrThrow(dto.targetIncidentId);

    if (source._id.equals(target._id)) {
      throw new BadRequestException('An incident cannot be merged into itself');
    }

    if (source.status === IncidentStatus.RESOLVED) {
      throw new BadRequestException('Source incident is already resolved');
    }

    if (target.status === IncidentStatus.RESOLVED) {
      throw new BadRequestException('Cannot merge into a resolved incident');
    }

    const sourceAlerts = await this.alertModel.find({ incidentId: source._id }).exec();
    await this.alertModel.updateMany(
      { incidentId: source._id },
      { $set: { incidentId: target._id, status: AlertStatus.CORRELATED } },
    );

    target.services = mergeServices(
      target.services,
      ...(source.services || []),
      ...sourceAlerts.map((alert) => alert.service),
    );
    target.severity = this.pickHigherSeverity(source.severity, target.severity);

    const sourceRelated = new Set((source.relatedIncidentIds || []).map((value) => value.toString()));
    const targetRelated = new Set((target.relatedIncidentIds || []).map((value) => value.toString()));
    if (!sourceRelated.has(target._id.toString())) {
      target.relatedIncidentIds = [...(target.relatedIncidentIds || []), source._id];
    }
    if (!targetRelated.has(source._id.toString())) {
      source.relatedIncidentIds = [...(source.relatedIncidentIds || []), target._id];
    }

    source.status = IncidentStatus.RESOLVED;
    source.resolvedAt = new Date();
    source.mergedIntoId = target._id;
    source.tags = Array.from(new Set([...(source.tags || []), 'merged']));

    await Promise.all([source.save(), target.save()]);

    await this.auditService.logEvent({
      incidentId: target._id,
      actorType: currentUser?.role ? ActorType.USER : ActorType.SYSTEM,
      actorId: currentUser?.userId || currentUser?.email || 'operator',
      action: 'INCIDENT_MERGED',
      entity: 'Incident',
      entityId: source._id.toString(),
      metadata: {
        sourceIncidentId: source._id.toString(),
        targetIncidentId: target._id.toString(),
        movedAlertCount: sourceAlerts.length,
        services: target.services,
      },
    });

    await this.redisService.invalidateIncident(source._id.toString());
    await this.redisService.invalidateIncident(target._id.toString());
    await this.redisService.invalidateDashboard();

    this.eventsGateway.emitIncidentStatusChanged(source);
    this.eventsGateway.emitIncidentUpdated(source);
    this.eventsGateway.emitIncidentUpdated(target);

    return { source, target };
  }
}
