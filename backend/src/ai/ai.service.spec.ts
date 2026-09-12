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
import { Incident } from '../incidents/schemas/incident.schema';
import { ContextGathererService, GroundedContext } from './tools/context-gatherer.service';
import { AIProviderFactory } from './providers/ai-provider.factory';
import { EventsGateway } from '../events/events.gateway';
import { AuditService } from '../audit/audit.service';
import { RedisService } from '../common/redis/redis.service';
import { NotFoundException } from '@nestjs/common';

describe('AIService - Investigation Pipeline & Safety Boundary', () => {
  let service: AIService;
  let aiInvestigationModel: any;
  let incidentModel: any;
  let contextGatherer: any;
  let aiProviderFactory: any;
  let eventsGateway: any;
  let auditService: any;
  let redisService: any;
  let configService: any;

  const incidentId = new Types.ObjectId();
  const mockIncidentDoc = {
    _id: incidentId,
    title: 'Database Spike',
    description: 'High active connections',
    service: 'database-cluster',
    severity: 'P1',
    status: 'OPEN',
    updatedAt: new Date(1700000000000),
    createdAt: new Date(1700000000000),
  };

  const sampleContext: GroundedContext = {
    incident: {
      id: incidentId.toString(),
      title: 'Database Spike',
      description: 'High active connections',
      severity: 'P1',
      status: 'OPEN',
      service: 'database-cluster',
      createdAt: mockIncidentDoc.createdAt,
      updatedAt: mockIncidentDoc.updatedAt,
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
            parameters: { targetPoolSize: 40 },
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('startInvestigation', () => {
    it('should throw NotFoundException if incident does not exist', async () => {
      incidentModel.findById.mockResolvedValueOnce(null);
      await expect(service.startInvestigation('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should enqueue a new investigation and return immediately as QUEUED', async () => {
      aiInvestigationModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null), // no existing investigation
        }),
      });

      const res = await service.startInvestigation(incidentId.toString(), {
        userId: 'operator-1',
      });

      expect(res.reused).toBe(false);
      expect(res.investigation.status).toBe(AIInvestigationStatus.QUEUED);
      expect(eventsGateway.emitAIInvestigationEvent).toHaveBeenCalledWith(
        incidentId.toString(),
        'investigation_queued',
        expect.anything(),
      );
    });

    it('should return existing investigation if already valid for current incident version (Idempotency)', async () => {
      const existingDoc = {
        _id: new Types.ObjectId(),
        incidentId,
        incidentVersion: `${incidentId.toString()}:1700000000000`,
        status: AIInvestigationStatus.COMPLETED,
        summary: 'Previously completed investigation.',
      };

      aiInvestigationModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(existingDoc),
        }),
      });

      const res = await service.startInvestigation(incidentId.toString(), {
        userId: 'operator-1',
      });

      expect(res.reused).toBe(true);
      expect(res.investigation).toEqual(existingDoc);
    });
  });

  describe('processInvestigationJob - Worker & Safety Boundary', () => {
    it('should execute full investigation pipeline and set proposedAction to PENDING_APPROVAL', async () => {
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
      // Proposed action must NEVER be automatically approved or executed by the AI worker
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
});

