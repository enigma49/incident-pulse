import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Incident,
  IncidentDocument,
  IncidentStatus,
  IncidentSeverity,
} from './schemas/incident.schema';
import { Alert, AlertDocument } from '../alerts/schemas/alert.schema';
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
} from './dto/incident.dto';
import { QueryIncidentsDto } from './dto/query-incidents.dto';

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    @InjectModel(Incident.name) private incidentModel: Model<IncidentDocument>,
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectModel(AIInvestigation.name)
    private aiInvestigationModel: Model<AIInvestigationDocument>,
    private auditService: AuditService,
  ) {}

  async create(dto: CreateIncidentDto, currentUser: any): Promise<IncidentDocument> {
    const incident = new this.incidentModel({
      title: dto.title,
      description: dto.description,
      severity: dto.severity,
      service: dto.service,
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
        service: saved.service,
        status: saved.status,
      },
    });

    return saved;
  }

  async findAll(query: QueryIncidentsDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};

    if (query.status) {
      filter.status = query.status;
    }
    if (query.severity) {
      filter.severity = query.severity;
    }
    if (query.service) {
      filter.service = query.service;
    }
    if (query.teamId) {
      filter.teamId = new Types.ObjectId(query.teamId);
    }
    if (query.assigneeId) {
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
      const searchRegex = new RegExp(query.search.trim(), 'i');
      filter.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { service: searchRegex },
      ];
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
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid incident ID format: ${id}`);
    }

    const incident = await this.incidentModel
      .findById(id)
      .populate('teamId', 'name serviceResponsibility')
      .populate('assigneeId', 'name email role')
      .exec();

    if (!incident) {
      throw new NotFoundException(`Incident with ID ${id} not found`);
    }

    const [alerts, tasks, comments, auditEvents, aiInvestigation] = await Promise.all([
      this.alertModel.find({ incidentId: incident._id }).sort({ timestamp: -1 }).exec(),
      this.taskModel
        .find({ incidentId: incident._id })
        .populate('assigneeId', 'name email')
        .sort({ createdAt: 1 })
        .exec(),
      this.commentModel
        .find({ incidentId: incident._id })
        .populate('userId', 'name email role')
        .sort({ createdAt: 1 })
        .exec(),
      this.auditService.findByIncidentId(id),
      this.aiInvestigationModel
        .findOne({ incidentId: incident._id })
        .sort({ createdAt: -1 })
        .exec(),
    ]);

    return {
      incident,
      alerts,
      tasks,
      comments,
      auditEvents,
      aiInvestigation,
    };
  }

  async update(id: string, dto: UpdateIncidentDto, currentUser: any): Promise<IncidentDocument> {
    const existing = await this.incidentModel.findById(id);
    if (!existing) {
      throw new NotFoundException(`Incident ${id} not found`);
    }

    const updates: Partial<Incident> = {};
    if (dto.title !== undefined) updates.title = dto.title;
    if (dto.description !== undefined) updates.description = dto.description;
    if (dto.service !== undefined) updates.service = dto.service;
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
      .findByIdAndUpdate(id, { $set: updates }, { new: true })
      .populate('teamId', 'name serviceResponsibility')
      .populate('assigneeId', 'name email role')
      .exec();

    await this.auditService.logEvent({
      incidentId: updated._id,
      actorType: currentUser?.role ? ActorType.USER : ActorType.SYSTEM,
      actorId: currentUser?.userId || currentUser?.email || 'system',
      action: 'INCIDENT_UPDATED',
      entity: 'Incident',
      entityId: updated._id.toString(),
      metadata: { updates },
    });

    return updated;
  }

  async changeStatus(
    id: string,
    newStatus: IncidentStatus,
    currentUser: any,
  ): Promise<IncidentDocument> {
    const existing = await this.incidentModel.findById(id);
    if (!existing) {
      throw new NotFoundException(`Incident ${id} not found`);
    }

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

    return saved;
  }

  async changeSeverity(
    id: string,
    newSeverity: IncidentSeverity,
    currentUser: any,
  ): Promise<IncidentDocument> {
    const existing = await this.incidentModel.findById(id);
    if (!existing) {
      throw new NotFoundException(`Incident ${id} not found`);
    }

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

    return saved;
  }

  async assign(
    id: string,
    dto: AssignIncidentDto,
    currentUser: any,
  ): Promise<IncidentDocument> {
    const existing = await this.incidentModel.findById(id);
    if (!existing) {
      throw new NotFoundException(`Incident ${id} not found`);
    }

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

    return saved.populate([
      { path: 'teamId', select: 'name serviceResponsibility' },
      { path: 'assigneeId', select: 'name email role' },
    ]);
  }

  async resolve(id: string, currentUser: any): Promise<IncidentDocument> {
    return this.changeStatus(id, IncidentStatus.RESOLVED, currentUser);
  }
}

