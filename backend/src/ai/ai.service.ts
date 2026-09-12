import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import {
  AIInvestigation,
  AIInvestigationDocument,
  AIInvestigationStatus,
  ProposedActionStatus,
} from './schemas/ai-investigation.schema';
import {
  Incident,
  IncidentDocument,
  IncidentStatus,
  IncidentSeverity,
} from '../incidents/schemas/incident.schema';
import { Task, TaskDocument, TaskStatus } from '../tasks/schemas/task.schema';
import { ContextGathererService } from './tools/context-gatherer.service';
import { AIProviderFactory } from './providers/ai-provider.factory';
import { EventsGateway } from '../events/events.gateway';
import { AuditService } from '../audit/audit.service';
import { ActorType } from '../audit/schemas/audit-event.schema';
import { RedisService } from '../common/redis/redis.service';
import { ApproveActionDto, RejectActionDto } from './dto/action-review.dto';

export const INVESTIGATION_QUEUE_NAME = 'incident-investigation';

@Injectable()
export class AIService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AIService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private isRedisQueueActive = false;

  constructor(
    @InjectModel(AIInvestigation.name)
    private aiInvestigationModel: Model<AIInvestigationDocument>,
    @InjectModel(Incident.name)
    private incidentModel: Model<IncidentDocument>,
    @InjectModel(Task.name)
    private taskModel: Model<TaskDocument>,
    private contextGatherer: ContextGathererService,
    private aiProviderFactory: AIProviderFactory,
    private eventsGateway: EventsGateway,
    private auditService: AuditService,
    private redisService: RedisService,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.initializeQueueAndWorker();
  }

  async onModuleDestroy() {
    try {
      if (this.worker) {
        await this.worker.close();
      }
      if (this.queue) {
        await this.queue.close();
      }
    } catch (err: any) {
      this.logger.warn(`[AIService] Error closing BullMQ resources: ${err.message}`);
    }
  }

  private async initializeQueueAndWorker() {
    try {
      const redisUrl = this.configService.get<string>('REDIS_URL');
      let host = this.configService.get<string>('REDIS_HOST', 'localhost');
      let port = Number(this.configService.get<number>('REDIS_PORT', 6379));
      let password = this.configService.get<string>('REDIS_PASSWORD') || undefined;

      if (redisUrl) {
        try {
          const url = new URL(redisUrl);
          host = url.hostname || host;
          port = Number(url.port) || port;
          password = url.password || password;
        } catch {}
      }

      const connectionOptions = {
        host,
        port,
        password,
        maxRetriesPerRequest: null,
      };

      this.queue = new Queue(INVESTIGATION_QUEUE_NAME, {
        connection: connectionOptions,
      });

      this.worker = new Worker(
        INVESTIGATION_QUEUE_NAME,
        async (job: Job) => {
          await this.processInvestigationJob(job.data);
        },
        {
          connection: connectionOptions,
          concurrency: 2,
        },
      );

      this.worker.on('failed', (job, err) => {
        this.logger.error(`[BullMQ Worker] Job ${job?.id} failed: ${err.message}`);
      });

      this.isRedisQueueActive = true;
      this.logger.log(`[BullMQ] Successfully connected to queue "${INVESTIGATION_QUEUE_NAME}"`);
    } catch (err: any) {
      this.isRedisQueueActive = false;
      this.logger.warn(
        `[BullMQ] Redis unavailable for BullMQ (${err.message}). Using resilient in-process async worker fallback.`,
      );
    }
  }

  /**
   * Enqueues an asynchronous investigation for an incident (idempotent, non-blocking)
   */
  async startInvestigation(incidentId: string, currentUser?: any) {
    const incident = await this.incidentModel.findById(incidentId);
    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found`);
    }

    const incidentVersion = `${incident._id.toString()}:${incident.updatedAt ? incident.updatedAt.getTime() : incident.createdAt.getTime()}`;

    // 1. Idempotency Check
    const existingInvestigation = await this.aiInvestigationModel
      .findOne({
        incidentId: incident._id,
        incidentVersion,
        status: {
          $in: [
            AIInvestigationStatus.QUEUED,
            AIInvestigationStatus.RUNNING,
            AIInvestigationStatus.COMPLETED,
          ],
        },
      })
      .sort({ createdAt: -1 })
      .exec();

    if (existingInvestigation) {
      if (existingInvestigation.status === AIInvestigationStatus.COMPLETED) {
        this.logger.log(
          `[AIService] Reusing completed investigation ${existingInvestigation._id} for incident ${incidentId} (Version: ${incidentVersion})`,
        );
        return {
          investigation: existingInvestigation,
          reused: true,
          message: 'Existing valid investigation found for current incident version.',
        };
      }

      // If pending in QUEUED/RUNNING, re-dispatch job to ensure queue processing
      const jobPayload = {
        incidentId,
        investigationId: existingInvestigation._id.toString(),
        incidentVersion,
        requestedBy: currentUser?.userId || currentUser?.email || 'operator',
      };

      if (this.isRedisQueueActive && this.queue) {
        try {
          await this.queue.add('investigate', jobPayload, {
            attempts: 2,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: true,
          });
        } catch (queueErr: any) {
          setImmediate(() => this.processInvestigationJob(jobPayload));
        }
      } else {
        setImmediate(() => this.processInvestigationJob(jobPayload));
      }

      return {
        investigation: existingInvestigation,
        reused: true,
        message: 'Investigation in progress; worker dispatched.',
      };
    }

    // 2. Persist new QUEUED investigation record
    const investigation = new this.aiInvestigationModel({
      incidentId: incident._id,
      incidentVersion,
      status: AIInvestigationStatus.QUEUED,
      progressEvents: ['investigation_queued'],
    });

    const savedInvestigation = await investigation.save();
    const investigationId = savedInvestigation._id.toString();

    // 3. Emit initial queued realtime event
    this.eventsGateway.emitAIInvestigationEvent(incidentId, 'investigation_queued', {
      investigationId,
      status: AIInvestigationStatus.QUEUED,
    });

    const jobPayload = {
      incidentId,
      investigationId,
      incidentVersion,
      requestedBy: currentUser?.userId || currentUser?.email || 'operator',
    };

    // 4. Enqueue to BullMQ if active, or dispatch to async in-process fallback
    if (this.isRedisQueueActive && this.queue) {
      try {
        await this.queue.add('investigate', jobPayload, {
          attempts: 2,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
        });
      } catch (queueErr: any) {
        this.logger.warn(`[BullMQ] Failed to add to Redis queue (${queueErr.message}). Dispatching in-process.`);
        setImmediate(() => this.processInvestigationJob(jobPayload));
      }
    } else {
      // Resilient in-process async dispatch
      setImmediate(() => this.processInvestigationJob(jobPayload));
    }

    return {
      investigation: savedInvestigation,
      reused: false,
      message: 'AI investigation queued successfully.',
    };
  }

  /**
   * Background worker execution pipeline:
   * 1. Mark RUNNING
   * 2. Gather grounded context
   * 3. Call AI Provider (OpenRouter or Mock fallback)
   * 4. Validate output with Zod & ground evidence
   * 5. Persist COMPLETED investigation with ProposedAction marked PENDING_APPROVAL
   */
  async processInvestigationJob(payload: {
    incidentId: string;
    investigationId: string;
    incidentVersion: string;
    requestedBy: string;
  }) {
    const { incidentId, investigationId, incidentVersion, requestedBy } = payload;
    this.logger.log(`[AI Worker] Starting investigation processing for incident ${incidentId}`);

    const investigation = await this.aiInvestigationModel.findById(investigationId);
    if (!investigation) {
      this.logger.error(`[AI Worker] Investigation record ${investigationId} not found`);
      return;
    }

    try {
      // Step 1: Mark RUNNING
      investigation.status = AIInvestigationStatus.RUNNING;
      investigation.startedAt = new Date();
      investigation.progressEvents.push('investigation_started');
      await investigation.save();

      this.eventsGateway.emitAIInvestigationEvent(incidentId, 'investigation_started', {
        investigationId,
        status: AIInvestigationStatus.RUNNING,
      });

      // Step 2: Gather Grounded Context
      investigation.progressEvents.push('gathering_context');
      await investigation.save();
      this.eventsGateway.emitAIInvestigationEvent(incidentId, 'gathering_context', {
        step: 'Gathering telemetry, correlated alerts, tasks, and team activity...',
      });

      const context = await this.contextGatherer.gatherContext(incidentId);

      investigation.progressEvents.push('context_ready');
      await investigation.save();
      this.eventsGateway.emitAIInvestigationEvent(incidentId, 'context_ready', {
        alertsFound: context.alerts.length,
        tasksFound: context.tasks.length,
        similarFound: context.similarIncidents.length,
      });

      // Step 3: Call AI Provider
      investigation.progressEvents.push('reasoning');
      await investigation.save();
      this.eventsGateway.emitAIInvestigationEvent(incidentId, 'reasoning', {
        step: 'Analyzing telemetry and formulating root cause hypotheses...',
      });

      const provider = this.aiProviderFactory.getProvider();
      const response = await provider.investigate(context);

      // Step 4: Validate Output & Ground Evidence
      investigation.progressEvents.push('validating_output');
      await investigation.save();
      this.eventsGateway.emitAIInvestigationEvent(incidentId, 'validating_output', {
        step: 'Validating structured findings and evidence references...',
      });

      const groundedEvidence = this.contextGatherer.validateEvidenceGrounding(
        response.result.evidence as any,
        context,
      );

      // Step 5: Persist Completed Investigation
      // Human Safety Boundary: Any proposed action is strictly marked PENDING_APPROVAL
      let proposedActionToStore = null;
      if (response.result.proposedAction) {
        proposedActionToStore = {
          type: response.result.proposedAction.type,
          description: response.result.proposedAction.description,
          parameters: response.result.proposedAction.parameters || {},
          reason: response.result.proposedAction.reason || 'AI proposed mitigation action',
          status: ProposedActionStatus.PENDING_APPROVAL,
          reviewedAt: null,
          reviewedBy: null,
        };
      }

      investigation.status = AIInvestigationStatus.COMPLETED;
      investigation.completedAt = new Date();
      investigation.summary = response.result.summary;
      investigation.hypotheses = response.result.hypotheses as any;
      investigation.evidence = groundedEvidence as any;
      investigation.confidence = response.result.confidence;
      investigation.recommendations = response.result.recommendations as any;
      investigation.proposedAction = proposedActionToStore as any;
      investigation.provider = response.metadata.provider;
      investigation.aiModel = response.metadata.model;
      investigation.tokenUsage = response.metadata.tokenUsage;
      investigation.latencyMs = response.metadata.latencyMs;
      investigation.rawOutput = response.rawOutput || '';
      investigation.progressEvents.push('completed');

      await investigation.save();

      // Log audit event
      await this.auditService.logEvent({
        incidentId: new Types.ObjectId(incidentId),
        actorType: ActorType.AI,
        actorId: `ai-engine:${response.metadata.provider}`,
        action: 'AI_INVESTIGATION_COMPLETED',
        entity: 'AIInvestigation',
        entityId: investigation._id.toString(),
        metadata: {
          confidence: investigation.confidence,
          hypothesesCount: investigation.hypotheses.length,
          hasProposedAction: !!investigation.proposedAction,
          provider: investigation.provider,
          latencyMs: investigation.latencyMs,
        },
      });

      // Invalidate Redis incident cache so fresh AI investigation is loaded
      await this.redisService.invalidateIncident(incidentId);

      // Emit completed realtime event
      this.eventsGateway.emitAIInvestigationEvent(incidentId, 'completed', {
        investigationId: investigation._id.toString(),
        summary: investigation.summary,
        confidence: investigation.confidence,
        hypotheses: investigation.hypotheses,
        evidence: investigation.evidence,
        recommendations: investigation.recommendations,
        proposedAction: investigation.proposedAction,
        provider: investigation.provider,
      });

      this.logger.log(
        `[AI Worker] Investigation ${investigationId} for incident ${incidentId} completed successfully (Provider: ${investigation.provider}, Confidence: ${investigation.confidence}%)`,
      );
    } catch (err: any) {
      this.logger.error(`[AI Worker] Investigation ${investigationId} failed: ${err.message}`, err.stack);

      investigation.status = AIInvestigationStatus.FAILED;
      investigation.error = err.message;
      investigation.progressEvents.push('failed');
      await investigation.save();

      await this.auditService.logEvent({
        incidentId: new Types.ObjectId(incidentId),
        actorType: ActorType.AI,
        actorId: 'ai-engine',
        action: 'AI_INVESTIGATION_FAILED',
        entity: 'AIInvestigation',
        entityId: investigation._id.toString(),
        metadata: { error: err.message },
      });

      this.eventsGateway.emitAIInvestigationEvent(incidentId, 'failed', {
        investigationId: investigation._id.toString(),
        error: err.message,
      });
    }
  }

  async getLatestInvestigation(incidentId: string): Promise<AIInvestigationDocument | null> {
    return this.aiInvestigationModel
      .findOne({ incidentId: new Types.ObjectId(incidentId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async getInvestigationHistory(incidentId: string): Promise<AIInvestigationDocument[]> {
    return this.aiInvestigationModel
      .find({ incidentId: new Types.ObjectId(incidentId) })
      .sort({ createdAt: -1 })
      .limit(10)
      .exec();
  }

  /**
   * Phase 7: Human Approval & Controlled Action Execution
   * Validates authentication, authorization, stale incident state,
   * executes controlled state mutation, updates investigation, logs audit events,
   * invalidates cache, and emits realtime events.
   */
  async approveAction(
    incidentId: string,
    currentUser: any,
    investigationId?: string,
    dto?: ApproveActionDto,
  ) {
    if (!Types.ObjectId.isValid(incidentId)) {
      throw new BadRequestException(`Invalid incident ID format: ${incidentId}`);
    }

    const incident = await this.incidentModel.findById(incidentId);
    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found`);
    }

    let investigation: AIInvestigationDocument | null = null;
    if (investigationId) {
      if (!Types.ObjectId.isValid(investigationId)) {
        throw new BadRequestException(`Invalid investigation ID format: ${investigationId}`);
      }
      investigation = await this.aiInvestigationModel.findById(investigationId);
    } else {
      investigation = await this.aiInvestigationModel
        .findOne({
          incidentId: incident._id,
          'proposedAction.status': ProposedActionStatus.PENDING_APPROVAL,
        })
        .sort({ createdAt: -1 });
    }

    if (!investigation || !investigation.proposedAction) {
      throw new NotFoundException('No pending AI proposed action found for this incident');
    }

    if (investigation.proposedAction.status !== ProposedActionStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Proposed action has already been reviewed (current status: ${investigation.proposedAction.status})`,
      );
    }

    const action = investigation.proposedAction;
    const isForce = dto?.force === true;

    // Rule 1: Stale State Validation - Cannot execute action on already RESOLVED incident (unless changing status or forced)
    if (incident.status === IncidentStatus.RESOLVED && action.type !== 'CHANGE_STATUS' && !isForce) {
      throw new ConflictException(
        `Stale action: Incident ${incidentId} is already RESOLVED. Proposed action '${action.type}' cannot be executed on a resolved incident.`,
      );
    }

    // Rule 2: Action-Specific Staleness & Controlled Execution
    let executionResult: Record<string, any> = {};

    switch (action.type) {
      case 'CHANGE_SEVERITY': {
        const targetSeverity = action.parameters?.severity as IncidentSeverity;
        if (!targetSeverity || !Object.values(IncidentSeverity).includes(targetSeverity)) {
          throw new BadRequestException(
            `Invalid target severity in proposed action parameters: ${targetSeverity}`,
          );
        }
        if (incident.severity === targetSeverity) {
          throw new ConflictException(
            `Stale action: Incident severity is already ${targetSeverity}. No change required.`,
          );
        }

        const oldSeverity = incident.severity;
        incident.severity = targetSeverity;
        await incident.save();

        executionResult = {
          actionType: 'CHANGE_SEVERITY',
          oldSeverity,
          newSeverity: targetSeverity,
        };

        this.eventsGateway.emitIncidentSeverityChanged(incident);
        this.eventsGateway.emitIncidentUpdated(incident);
        break;
      }

      case 'CHANGE_STATUS': {
        const targetStatus = action.parameters?.status as IncidentStatus;
        if (!targetStatus || !Object.values(IncidentStatus).includes(targetStatus)) {
          throw new BadRequestException(
            `Invalid target status in proposed action parameters: ${targetStatus}`,
          );
        }
        if (incident.status === targetStatus) {
          throw new ConflictException(
            `Stale action: Incident status is already ${targetStatus}. No change required.`,
          );
        }

        const oldStatus = incident.status;
        incident.status = targetStatus;
        if (targetStatus === IncidentStatus.RESOLVED) {
          incident.resolvedAt = new Date();
        } else {
          incident.resolvedAt = null;
        }
        await incident.save();

        executionResult = {
          actionType: 'CHANGE_STATUS',
          oldStatus,
          newStatus: targetStatus,
        };

        this.eventsGateway.emitIncidentStatusChanged(incident);
        this.eventsGateway.emitIncidentUpdated(incident);
        break;
      }

      case 'CREATE_TASK': {
        const title = action.parameters?.title;
        if (!title || typeof title !== 'string' || !title.trim()) {
          throw new BadRequestException('Missing task title in proposed action parameters');
        }

        const existingTask = await this.taskModel.findOne({
          incidentId: incident._id,
          title: title.trim(),
        });
        if (existingTask && !isForce) {
          throw new ConflictException(
            `Stale action: A checklist task titled "${title.trim()}" already exists on this incident.`,
          );
        }

        const task = new this.taskModel({
          incidentId: incident._id,
          title: title.trim(),
          description: action.parameters?.description || action.reason || '',
          status: TaskStatus.PENDING,
          assigneeId:
            action.parameters?.assigneeId && Types.ObjectId.isValid(action.parameters.assigneeId)
              ? new Types.ObjectId(action.parameters.assigneeId)
              : null,
        });

        const savedTask = await task.save();
        const populatedTask = await savedTask.populate('assigneeId', 'name email role');

        executionResult = {
          actionType: 'CREATE_TASK',
          taskId: savedTask._id.toString(),
          title: savedTask.title,
          status: savedTask.status,
        };

        this.eventsGateway.emitTaskCreated(incidentId, populatedTask);
        break;
      }

      case 'ASSIGN_INCIDENT': {
        const targetAssigneeId = action.parameters?.assigneeId;
        const targetTeamId = action.parameters?.teamId;

        if (!targetAssigneeId && !targetTeamId) {
          throw new BadRequestException(
            'Proposed action parameters must specify at least assigneeId or teamId',
          );
        }

        const sameAssignee =
          !targetAssigneeId || incident.assigneeId?.toString() === targetAssigneeId;
        const sameTeam = !targetTeamId || incident.teamId?.toString() === targetTeamId;

        if (sameAssignee && sameTeam) {
          throw new ConflictException(
            'Stale action: Incident is already assigned to the proposed assignee and team.',
          );
        }

        if (targetAssigneeId && Types.ObjectId.isValid(targetAssigneeId)) {
          incident.assigneeId = new Types.ObjectId(targetAssigneeId);
        }
        if (targetTeamId && Types.ObjectId.isValid(targetTeamId)) {
          incident.teamId = new Types.ObjectId(targetTeamId);
        }

        await incident.save();
        const populated = await incident.populate([
          { path: 'teamId', select: 'name serviceResponsibility' },
          { path: 'assigneeId', select: 'name email role' },
        ]);

        executionResult = {
          actionType: 'ASSIGN_INCIDENT',
          assigneeId: incident.assigneeId?.toString() || null,
          teamId: incident.teamId?.toString() || null,
        };

        this.eventsGateway.emitIncidentAssigned(populated);
        this.eventsGateway.emitIncidentUpdated(populated);
        break;
      }

      default:
        throw new BadRequestException(
          `Unsupported proposed action type for controlled execution: ${action.type}`,
        );
    }

    // Step 3: Update Investigation Document Status
    investigation.proposedAction.status = ProposedActionStatus.EXECUTED;
    investigation.proposedAction.reviewedAt = new Date();
    investigation.proposedAction.reviewedBy =
      currentUser?.email || currentUser?.userId || 'operator';
    investigation.proposedAction.executionResult = executionResult;
    const savedInvestigation = await investigation.save();

    // Step 4: Audit Event Logging (Authenticated & Auditable)
    await this.auditService.logEvent({
      incidentId: incident._id,
      actorType: ActorType.USER,
      actorId: currentUser?.userId || currentUser?.email || 'operator',
      action: 'AI_ACTION_APPROVED',
      entity: 'AIInvestigation',
      entityId: investigation._id.toString(),
      metadata: {
        actionType: action.type,
        description: action.description,
        parameters: action.parameters,
        reason: action.reason,
        reviewedBy: currentUser?.email || currentUser?.userId,
      },
    });

    await this.auditService.logEvent({
      incidentId: incident._id,
      actorType: ActorType.SYSTEM,
      actorId: currentUser?.userId || currentUser?.email || 'system',
      action: 'AI_ACTION_EXECUTED',
      entity: 'Incident',
      entityId: incident._id.toString(),
      metadata: {
        actionType: action.type,
        executionResult,
      },
    });

    // Step 5: Redis Cache Invalidation
    await this.redisService.invalidateIncident(incidentId);

    // Step 6: Realtime Gateway Broadcast
    this.eventsGateway.emitAIInvestigationEvent(incidentId, 'action_executed', {
      investigationId: investigation._id.toString(),
      action: investigation.proposedAction,
      executionResult,
    });

    this.logger.log(
      `[AIService] Approved and executed action ${action.type} for incident ${incidentId} by ${currentUser?.email || currentUser?.userId}`,
    );

    return {
      success: true,
      message: `Action ${action.type} approved and executed successfully`,
      action: investigation.proposedAction,
      executionResult,
      investigation: savedInvestigation,
    };
  }

  /**
   * Phase 7: Human Action Rejection
   * Explicit operator rejection of AI proposed action with optional rationale.
   */
  async rejectAction(
    incidentId: string,
    currentUser: any,
    dto?: RejectActionDto,
    investigationId?: string,
  ) {
    if (!Types.ObjectId.isValid(incidentId)) {
      throw new BadRequestException(`Invalid incident ID format: ${incidentId}`);
    }

    const incident = await this.incidentModel.findById(incidentId);
    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found`);
    }

    let investigation: AIInvestigationDocument | null = null;
    if (investigationId) {
      if (!Types.ObjectId.isValid(investigationId)) {
        throw new BadRequestException(`Invalid investigation ID format: ${investigationId}`);
      }
      investigation = await this.aiInvestigationModel.findById(investigationId);
    } else {
      investigation = await this.aiInvestigationModel
        .findOne({
          incidentId: incident._id,
          'proposedAction.status': ProposedActionStatus.PENDING_APPROVAL,
        })
        .sort({ createdAt: -1 });
    }

    if (!investigation || !investigation.proposedAction) {
      throw new NotFoundException('No pending AI proposed action found for this incident');
    }

    if (investigation.proposedAction.status !== ProposedActionStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Proposed action has already been reviewed (current status: ${investigation.proposedAction.status})`,
      );
    }

    const rejectionReason = dto?.reason?.trim() || 'Rejected by human operator';

    investigation.proposedAction.status = ProposedActionStatus.REJECTED;
    investigation.proposedAction.reviewedAt = new Date();
    investigation.proposedAction.reviewedBy =
      currentUser?.email || currentUser?.userId || 'operator';
    investigation.proposedAction.rejectionReason = rejectionReason;
    const savedInvestigation = await investigation.save();

    await this.auditService.logEvent({
      incidentId: incident._id,
      actorType: ActorType.USER,
      actorId: currentUser?.userId || currentUser?.email || 'operator',
      action: 'AI_ACTION_REJECTED',
      entity: 'AIInvestigation',
      entityId: investigation._id.toString(),
      metadata: {
        actionType: investigation.proposedAction.type,
        reason: rejectionReason,
        reviewedBy: currentUser?.email || currentUser?.userId,
      },
    });

    await this.redisService.invalidateIncident(incidentId);

    this.eventsGateway.emitAIInvestigationEvent(incidentId, 'action_rejected', {
      investigationId: investigation._id.toString(),
      action: investigation.proposedAction,
      reason: rejectionReason,
    });

    this.logger.log(
      `[AIService] Rejected action ${investigation.proposedAction.type} for incident ${incidentId} by ${currentUser?.email || currentUser?.userId} (Reason: ${rejectionReason})`,
    );

    return {
      success: true,
      message: `Action ${investigation.proposedAction.type} was rejected`,
      action: investigation.proposedAction,
      investigation: savedInvestigation,
    };
  }
}

