import { Test, TestingModule } from '@nestjs/testing';
import { IncidentsService } from './incidents.service';
import { getModelToken } from '@nestjs/mongoose';
import { Incident, IncidentSeverity, IncidentStatus } from './schemas/incident.schema';
import { Alert } from '../alerts/schemas/alert.schema';
import { Comment } from '../comments/schemas/comment.schema';
import { Task } from '../tasks/schemas/task.schema';
import { AIInvestigation } from '../ai/schemas/ai-investigation.schema';
import { AuditService } from '../audit/audit.service';
import { RedisService, CACHE_KEYS } from '../common/redis/redis.service';
import { EventsGateway } from '../events/events.gateway';
import { IncidentRefService } from './incident-ref.service';
import { Types } from 'mongoose';

describe('IncidentsService Caching & Invalidation', () => {
  let service: IncidentsService;
  let redisService: jest.Mocked<Partial<RedisService>>;
  let incidentModel: any;
  let incidentRefService: any;

  const validId = new Types.ObjectId().toString();
  const mockIncident = {
    _id: validId,
    incidentNumber: 7,
    title: 'Payment Gateway 504 Timeout',
    severity: IncidentSeverity.P1,
    status: IncidentStatus.OPEN,
    services: ['payment-service'],
    save: jest.fn().mockImplementation(function () {
      return Promise.resolve(this);
    }),
  };

  beforeEach(async () => {
    redisService = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      invalidateIncident: jest.fn().mockResolvedValue(undefined),
      invalidateDashboard: jest.fn().mockResolvedValue(undefined),
    };

    incidentModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      _id: validId,
      status: IncidentStatus.OPEN,
      save: jest.fn().mockResolvedValue({ ...dto, _id: validId }),
    }));

    incidentModel.findById = jest.fn().mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockIncident),
        }),
      }),
    });

    incidentRefService = {
      getNextIncidentNumber: jest.fn().mockResolvedValue(7),
      findByRefOrThrow: jest.fn().mockResolvedValue(mockIncident),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentsService,
        { provide: getModelToken(Incident.name), useValue: incidentModel },
        {
          provide: getModelToken(Alert.name),
          useValue: { find: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }) }) },
        },
        {
          provide: getModelToken(Comment.name),
          useValue: { find: jest.fn().mockReturnValue({ populate: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }) }) }) },
        },
        {
          provide: getModelToken(Task.name),
          useValue: { find: jest.fn().mockReturnValue({ populate: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }) }) }) },
        },
        {
          provide: getModelToken(AIInvestigation.name),
          useValue: { findOne: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }) }) },
        },
        {
          provide: AuditService,
          useValue: { logEvent: jest.fn().mockResolvedValue({} as any), findByIncidentId: jest.fn().mockResolvedValue([]) },
        },
        { provide: RedisService, useValue: redisService },
        {
          provide: EventsGateway,
          useValue: {
            emitIncidentCreated: jest.fn(),
            emitIncidentUpdated: jest.fn(),
            emitIncidentStatusChanged: jest.fn(),
            emitIncidentSeverityChanged: jest.fn(),
            emitIncidentAssigned: jest.fn(),
            emitCommentCreated: jest.fn(),
            emitTaskCreated: jest.fn(),
            emitTaskUpdated: jest.fn(),
            emitTaskDeleted: jest.fn(),
            emitAlertAssociated: jest.fn(),
            emitAIInvestigationEvent: jest.fn(),
          },
        },
        { provide: IncidentRefService, useValue: incidentRefService },
      ],
    }).compile();

    service = module.get<IncidentsService>(IncidentsService);
  });

  it('should serve incident detail from cache when present', async () => {
    const cachedData = {
      incident: { _id: validId, title: 'Cached Incident' },
      alerts: [],
      tasks: [],
      comments: [],
    };
    redisService.get.mockResolvedValue(cachedData);

    const result = await service.findOne(validId);

    expect(result.fromCache).toBe(true);
    expect(result.incident.title).toBe('Cached Incident');
    expect(incidentModel.findById).not.toHaveBeenCalled();
  });

  it('should query database and populate cache on cache miss', async () => {
    redisService.get.mockResolvedValue(null);

    const result = await service.findOne(validId);

    expect(result.fromCache).toBe(false);
    expect(incidentModel.findById).toHaveBeenCalledWith(validId);
    expect(redisService.set).toHaveBeenCalledWith(
      CACHE_KEYS.incidentDetail(validId),
      expect.anything(),
      15, // 15 seconds TTL
    );
  });

  it('should invalidate incident cache and dashboard cache on status change', async () => {
    incidentRefService.findByRefOrThrow.mockResolvedValue({
      ...mockIncident,
      status: IncidentStatus.OPEN,
      save: jest.fn().mockResolvedValue({ ...mockIncident, status: IncidentStatus.RESOLVED }),
    });

    const user = { userId: 'u1', email: 'op@example.com', role: 'OPERATOR' };
    await service.changeStatus(validId, IncidentStatus.RESOLVED, user);

    expect(redisService.invalidateIncident).toHaveBeenCalledWith(validId);
  });

  it('should invalidate incident cache on severity change', async () => {
    incidentRefService.findByRefOrThrow.mockResolvedValue({
      ...mockIncident,
      severity: IncidentSeverity.P3,
      save: jest.fn().mockResolvedValue({ ...mockIncident, severity: IncidentSeverity.P1 }),
    });

    const user = { userId: 'u1', email: 'op@example.com', role: 'OPERATOR' };
    await service.changeSeverity(validId, IncidentSeverity.P1, user);

    expect(redisService.invalidateIncident).toHaveBeenCalledWith(validId);
  });

  it('should invalidate dashboard cache on incident creation', async () => {
    const dto = {
      title: 'New Incident',
      description: 'Test',
      severity: IncidentSeverity.P2,
      services: ['auth-service'],
    };
    const user = { userId: 'u1', email: 'op@example.com', role: 'OPERATOR' };

    await service.create(dto, user);

    expect(redisService.invalidateDashboard).toHaveBeenCalled();
  });
});

