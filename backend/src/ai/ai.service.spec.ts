import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { AIService } from './ai.service';
import {
  AIInvestigation,
  AIInvestigationStatus,
  ProposedActionStatus,
} from './schemas/ai-investigation.schema';
import { Incident, IncidentSeverity, IncidentStatus } from '../incidents/schemas/incident.schema';
import { Task } from '../tasks/schemas/task.schema';
import { ContextGathererService, GroundedContext } from './tools/context-gatherer.service';
import { AIProviderFactory } from './providers/ai-provider.factory';
import { EventsGateway } from '../events/events.gateway';
import { AuditService } from '../audit/audit.service';
import { RedisService } from '../common/redis/redis.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('AIService - Investigation Pipeline & Controlled Action Execution', () => {
  let service: AIService;
  let aiInvestigationModel: any;
  let incidentModel: any;
  let taskModel: any;
  let contextGatherer: any;
  let aiProviderFactory: any;
  let eventsGateway: any;
  let auditService: any;
  let redisService: any;
  let configService: any;

  const incidentId = new Types.ObjectId();
  let mockIncidentDoc: any;

  const sampleContext: GroundedContext = {
    incident: {
      id: incidentId.toString(),
      title: 'Database Spike',
      description: 'High active connections',
      severity: 'P2',
      status: 'OPEN',
      service: 'database-cluster',
      createdAt: new Date(1700000000000),
      updatedAt: new Date(1700000000000),
      version: `${incidentId.toString()}:1700000000000`,
    },
    assignee: null,
    team: null,
    alerts: [],
    recentActivity: [],
    tasks: [],
    similarIncidents: [],
    validEntityIds: new Set([incidentId.toString()]),
  };

  beforeEach(async () => {
    mockIncidentDoc = {
      _id: incidentId,
      title: 'Database Spike',
      description: 'High active connections',
      service: 'database-cluster',
      severity: IncidentSeverity.P2,
      status: IncidentStatus.INVESTIGATING,
      assigneeId: null,
      teamId: null,
      updatedAt: new Date(1700000000000),
      createdAt: new Date(1700000000000),
      save: jest.fn().mockImplementation(function () {
        return Promise.resolve(this);
      }),
      populate: jest.fn().mockImplementation(function () {
        return Promise.resolve(this);
      }),
    };

    aiInvestigationModel = jest.fn().mockImplementation((data) => ({
      ...data,
      _id: new Types.ObjectId(),
      save: jest.fn().mockImplementation(function () {
        return Promise.resolve(this);
      }),
    }));
    aiInvestigationModel.findOne = jest.fn();
    aiInvestigationModel.findById = jest.fn();
    aiInvestigationModel.find = jest.fn();

    incidentModel = {
      findById: jest.fn().mockResolvedValue(mockIncidentDoc),
    };

    taskModel = jest.fn().mockImplementation((data) => ({
      ...data,
      _id: new Types.ObjectId(),
      save: jest.fn().mockImplementation(function () {
        return Promise.resolve(this);
      }),
      populate: jest.fn().mockImplementation(function () {
        return Promise.resolve(this);
      }),
    }));
    taskModel.findOne = jest.fn().mockResolvedValue(null);

    contextGatherer = {
      gatherContext: jest.fn().mockResolvedValue(sampleContext),
      validateEvidenceGrounding: jest.fn().mockImplementation((ev) => ev),
    };

    const mockProvider = {
      name: 'mock',
      investigate: jest.fn().mockResolvedValue({
        result: {
          summary: 'Database connection pool exhausted due to unindexed queries.',
          hypotheses: [
            {
              title: 'Connection Pool Starvation',
              explanation: 'Heavy queries blocking worker threads.',
              confidence: 85,
            },
          ],
          evidence: [
            {
              type: 'incident',
              id: incidentId.toString(),
              reason: 'Incident active with high severity.',
            },
          ],
          confidence: 85,
          recommendations: [
            {
              title: 'Restart idle worker pools',
              explanation: 'Frees leaked connections.',
            },
          ],
          proposedAction: {
            type: 'CREATE_TASK',
            description: 'Scale connection pool',
            parameters: { title: 'Scale connection pool capacity', targetPoolSize: 40 },
          },
        },
        metadata: {
          provider: 'mock',
          model: 'mock-deterministic-v1',
          latencyMs: 120,
          tokenUsage: { promptTokens: 400, completionTokens: 200, totalTokens: 600 },
        },
      }),
    };

    aiProviderFactory = {
      getProvider: jest.fn().mockReturnValue(mockProvider),
    };

    eventsGateway = {
      emitAIInvestigationEvent: jest.fn(),
      emitTaskCreated: jest.fn(),
      emitIncidentSeverityChanged: jest.fn(),
      emitIncidentStatusChanged: jest.fn(),
      emitIncidentAssigned: jest.fn(),
      emitIncidentUpdated: jest.fn(),
    };

    auditService = {
      logEvent: jest.fn().mockResolvedValue({} as any),
    };

    redisService = {
      invalidateIncident: jest.fn().mockResolvedValue(undefined),
    };

    configService = {
      get: jest.fn().mockReturnValue(''),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIService,
        { provide: getModelToken(AIInvestigation.name), useValue: aiInvestigationModel },
        { provide: getModelToken(Incident.name), useValue: incidentModel },
        { provide: getModelToken(Task.name), useValue: taskModel },
        { provide: ContextGathererService, useValue: contextGatherer },
        { provide: AIProviderFactory, useValue: aiProviderFactory },
        { provide: EventsGateway, useValue: eventsGateway },
        { provide: AuditService, useValue: auditService },
        { provide: RedisService, useValue: redisService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<AIService>(AIService);
  });

  describe('Investigation Enqueue & Idempotency', () => {
    it('should throw NotFoundException if incident does not exist', async () => {
      incidentModel.findById.mockResolvedValueOnce(null);
      await expect(
        service.startInvestigation(new Types.ObjectId().toString(), { email: 'operator@example.com' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reuse existing active investigation for the same incident version', async () => {
      const existingDoc = {
        _id: new Types.ObjectId(),
        incidentId,
        status: AIInvestigationStatus.RUNNING,
      };
      aiInvestigationModel.findOne.mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValueOnce(existingDoc),
        }),
      });

      const res = await service.startInvestigation(incidentId.toString(), {
        email: 'operator@example.com',
      });

      expect(res.reused).toBe(true);
      expect(res.investigation._id).toEqual(existingDoc._id);
    });
  });

  describe('AI Worker Pipeline Execution & Human Safety Boundary (Phase 6)', () => {
    it('should execute full pipeline and leave proposed action in PENDING_APPROVAL status', async () => {
      const investigationDoc: any = {
        _id: new Types.ObjectId(),
        incidentId,
        status: AIInvestigationStatus.QUEUED,
        progressEvents: [],
        save: jest.fn().mockResolvedValue(true),
      };

      aiInvestigationModel.findById.mockResolvedValue(investigationDoc);

      await service.processInvestigationJob({
        incidentId: incidentId.toString(),
        investigationId: investigationDoc._id.toString(),
        incidentVersion: `${incidentId.toString()}:1700000000000`,
        requestedBy: 'operator-1',
      });

      expect(contextGatherer.gatherContext).toHaveBeenCalledWith(incidentId.toString());
      expect(investigationDoc.status).toBe(AIInvestigationStatus.COMPLETED);
      expect(investigationDoc.summary).toContain('Database connection pool');

      // CRITICAL HUMAN SAFETY BOUNDARY CHECK:
      // Worker NEVER directly executes action; stores as PENDING_APPROVAL
      expect(investigationDoc.proposedAction).toBeDefined();
      expect(investigationDoc.proposedAction.status).toBe(ProposedActionStatus.PENDING_APPROVAL);

      expect(eventsGateway.emitAIInvestigationEvent).toHaveBeenCalledWith(
        incidentId.toString(),
        'completed',
        expect.anything(),
      );
      expect(redisService.invalidateIncident).toHaveBeenCalledWith(incidentId.toString());
    });

    it('should handle provider failure gracefully and set status to FAILED', async () => {
      const investigationDoc: any = {
        _id: new Types.ObjectId(),
        incidentId,
        status: AIInvestigationStatus.QUEUED,
        progressEvents: [],
        save: jest.fn().mockResolvedValue(true),
      };

      aiInvestigationModel.findById.mockResolvedValue(investigationDoc);
      contextGatherer.gatherContext.mockRejectedValueOnce(new Error('Database network timeout'));

      await service.processInvestigationJob({
        incidentId: incidentId.toString(),
        investigationId: investigationDoc._id.toString(),
        incidentVersion: `${incidentId.toString()}:1700000000000`,
        requestedBy: 'operator-1',
      });

      expect(investigationDoc.status).toBe(AIInvestigationStatus.FAILED);
      expect(investigationDoc.error).toContain('Database network timeout');
      expect(eventsGateway.emitAIInvestigationEvent).toHaveBeenCalledWith(
        incidentId.toString(),
        'failed',
        expect.anything(),
      );
    });
  });

  describe('Phase 7: Human Approval & Controlled Action Execution', () => {
    it('should approve and execute CREATE_TASK action, emit event, and record audit', async () => {
      const investigationDoc: any = {
        _id: new Types.ObjectId(),
        incidentId,
        proposedAction: {
          type: 'CREATE_TASK',
          description: 'Create mitigation checklist item',
          parameters: { title: 'Scale connection pool size to 40' },
          reason: 'Relieves pool saturation',
          status: ProposedActionStatus.PENDING_APPROVAL,
        },
        save: jest.fn().mockImplementation(function () {
          return Promise.resolve(this);
        }),
      };

      aiInvestigationModel.findById.mockResolvedValue(investigationDoc);

      const result = await service.approveAction(
        incidentId.toString(),
        { email: 'operator@example.com', role: 'OPERATOR' },
        investigationDoc._id.toString(),
      );

      expect(result.success).toBe(true);
      expect(investigationDoc.proposedAction.status).toBe(ProposedActionStatus.EXECUTED);
      expect(investigationDoc.proposedAction.reviewedBy).toBe('operator@example.com');
      expect(eventsGateway.emitTaskCreated).toHaveBeenCalled();
      expect(eventsGateway.emitAIInvestigationEvent).toHaveBeenCalledWith(
        incidentId.toString(),
        'action_executed',
        expect.anything(),
      );
      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AI_ACTION_APPROVED' }),
      );
      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AI_ACTION_EXECUTED' }),
      );
      expect(redisService.invalidateIncident).toHaveBeenCalledWith(incidentId.toString());
    });

    it('should approve and execute CHANGE_SEVERITY action, updating incident severity', async () => {
      mockIncidentDoc.severity = IncidentSeverity.P2;

      const investigationDoc: any = {
        _id: new Types.ObjectId(),
        incidentId,
        proposedAction: {
          type: 'CHANGE_SEVERITY',
          description: 'Escalate to P1 based on multi-service cascading failures',
          parameters: { severity: IncidentSeverity.P1 },
          reason: 'Severe customer outage detected',
          status: ProposedActionStatus.PENDING_APPROVAL,
        },
        save: jest.fn().mockImplementation(function () {
          return Promise.resolve(this);
        }),
      };

      aiInvestigationModel.findOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue(investigationDoc),
      });

      const result = await service.approveAction(
        incidentId.toString(),
        { email: 'admin@example.com', role: 'ADMIN' },
      );

      expect(result.success).toBe(true);
      expect(mockIncidentDoc.severity).toBe(IncidentSeverity.P1);
      expect(eventsGateway.emitIncidentSeverityChanged).toHaveBeenCalledWith(mockIncidentDoc);
      expect(investigationDoc.proposedAction.status).toBe(ProposedActionStatus.EXECUTED);
    });

    it('should approve and execute CHANGE_STATUS action, updating incident status and resolvedAt', async () => {
      mockIncidentDoc.status = IncidentStatus.INVESTIGATING;

      const investigationDoc: any = {
        _id: new Types.ObjectId(),
        incidentId,
        proposedAction: {
          type: 'CHANGE_STATUS',
          description: 'Mark incident as MITIGATED',
          parameters: { status: IncidentStatus.MITIGATED },
          reason: 'Telemetry stabilized after pool restart',
          status: ProposedActionStatus.PENDING_APPROVAL,
        },
        save: jest.fn().mockImplementation(function () {
          return Promise.resolve(this);
        }),
      };

      aiInvestigationModel.findById.mockResolvedValue(investigationDoc);

      const result = await service.approveAction(
        incidentId.toString(),
        { email: 'operator@example.com', role: 'OPERATOR' },
        investigationDoc._id.toString(),
      );

      expect(result.success).toBe(true);
      expect(mockIncidentDoc.status).toBe(IncidentStatus.MITIGATED);
      expect(eventsGateway.emitIncidentStatusChanged).toHaveBeenCalledWith(mockIncidentDoc);
    });

    it('should reject stale action when target severity is already equal to current incident severity', async () => {
      mockIncidentDoc.severity = IncidentSeverity.P1;

      const investigationDoc: any = {
        _id: new Types.ObjectId(),
        incidentId,
        proposedAction: {
          type: 'CHANGE_SEVERITY',
          parameters: { severity: IncidentSeverity.P1 },
          reason: 'Escalate to P1',
          status: ProposedActionStatus.PENDING_APPROVAL,
        },
      };

      aiInvestigationModel.findById.mockResolvedValue(investigationDoc);

      await expect(
        service.approveAction(
          incidentId.toString(),
          { email: 'operator@example.com' },
          investigationDoc._id.toString(),
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject action on an already RESOLVED incident', async () => {
      mockIncidentDoc.status = IncidentStatus.RESOLVED;

      const investigationDoc: any = {
        _id: new Types.ObjectId(),
        incidentId,
        proposedAction: {
          type: 'CREATE_TASK',
          parameters: { title: 'Scale pods' },
          reason: 'Relieve load',
          status: ProposedActionStatus.PENDING_APPROVAL,
        },
      };

      aiInvestigationModel.findById.mockResolvedValue(investigationDoc);

      await expect(
        service.approveAction(
          incidentId.toString(),
          { email: 'operator@example.com' },
          investigationDoc._id.toString(),
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if action was already reviewed', async () => {
      const investigationDoc: any = {
        _id: new Types.ObjectId(),
        incidentId,
        proposedAction: {
          type: 'CHANGE_SEVERITY',
          parameters: { severity: IncidentSeverity.P1 },
          reason: 'Escalate to P1',
          status: ProposedActionStatus.EXECUTED,
        },
      };

      aiInvestigationModel.findById.mockResolvedValue(investigationDoc);

      await expect(
        service.approveAction(
          incidentId.toString(),
          { email: 'operator@example.com' },
          investigationDoc._id.toString(),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully reject proposed action and record operator reason and audit event', async () => {
      const investigationDoc: any = {
        _id: new Types.ObjectId(),
        incidentId,
        proposedAction: {
          type: 'CREATE_TASK',
          parameters: { title: 'Unnecessary Task' },
          reason: 'Suggested by AI',
          status: ProposedActionStatus.PENDING_APPROVAL,
        },
        save: jest.fn().mockImplementation(function () {
          return Promise.resolve(this);
        }),
      };

      aiInvestigationModel.findById.mockResolvedValue(investigationDoc);

      const result = await service.rejectAction(
        incidentId.toString(),
        { email: 'operator@example.com' },
        { reason: 'Manual failover underway; scaling not required.' },
        investigationDoc._id.toString(),
      );

      expect(result.success).toBe(true);
      expect(investigationDoc.proposedAction.status).toBe(ProposedActionStatus.REJECTED);
      expect(investigationDoc.proposedAction.rejectionReason).toBe(
        'Manual failover underway; scaling not required.',
      );
      expect(investigationDoc.proposedAction.reviewedBy).toBe('operator@example.com');
      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AI_ACTION_REJECTED' }),
      );
      expect(eventsGateway.emitAIInvestigationEvent).toHaveBeenCalledWith(
        incidentId.toString(),
        'action_rejected',
        expect.anything(),
      );
      expect(redisService.invalidateIncident).toHaveBeenCalledWith(incidentId.toString());
    });
  });
});
