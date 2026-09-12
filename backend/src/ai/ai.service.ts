import {
  Injectable,
  NotFoundException,
  BadRequestException,
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
import { Incident, IncidentDocument } from '../incidents/schemas/incident.schema';
import { ContextGathererService } from './tools/context-gatherer.service';
import { AIProviderFactory } from './providers/ai-provider.factory';
import { EventsGateway } from '../events/events.gateway';
import { AuditService } from '../audit/audit.service';
import { ActorType } from '../audit/schemas/audit-event.schema';
import { RedisService } from '../common/redis/redis.service';

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
    const redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    try {
      const url = new URL(redisUrl);
      const connectionOptions = {
        host: url.hostname || 'localhost',
        port: Number(url.port) || 6379,
        password: url.password || undefined,
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
      this.logger.log(
        `[AIService] Reusing existing investigation ${existingInvestigation._id} for incident ${incidentId} (Version: ${incidentVersion}, Status: ${existingInvestigation.status})`,
      );
      return {
        investigation: existingInvestigation,
        reused: true,
        message: 'Existing valid investigation found for current incident version.',
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
}

