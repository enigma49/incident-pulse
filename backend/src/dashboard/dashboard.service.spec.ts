import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { getModelToken } from '@nestjs/mongoose';
import { Incident } from '../incidents/schemas/incident.schema';
import { Team } from '../teams/schemas/team.schema';
import { AIInvestigation } from '../ai/schemas/ai-investigation.schema';
import { AuditService } from '../audit/audit.service';
import { RedisService, CACHE_KEYS, CACHE_TTLS } from '../common/redis/redis.service';

describe('DashboardService Caching & Aggregations (Phase 8)', () => {
  let service: DashboardService;
  let redisService: jest.Mocked<Partial<RedisService>>;
  let incidentModel: any;
  let teamModel: any;
  let aiInvestigationModel: any;

  beforeEach(async () => {
    redisService = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
    };

    const mockQuery: any = {
      populate: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };

    incidentModel = {
      countDocuments: jest.fn().mockResolvedValue(50),
      aggregate: jest.fn().mockResolvedValue([{ _id: 'P1', count: 5 }]),
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue(mockQuery),
        }),
      }),
    };

    teamModel = {
      find: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { _id: 'team-1', name: 'Core Infrastructure', serviceResponsibility: ['auth-service'] },
        ]),
      }),
    };

    aiInvestigationModel = {
      countDocuments: jest.fn().mockResolvedValue(3),
      aggregate: jest.fn().mockResolvedValue([{ _id: 'COMPLETED', count: 12 }, { _id: null, avgConf: 88 }]),
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            populate: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getModelToken(Incident.name), useValue: incidentModel },
        { provide: getModelToken(Team.name), useValue: teamModel },
        { provide: getModelToken(AIInvestigation.name), useValue: aiInvestigationModel },
        {
          provide: AuditService,
          useValue: { findRecent: jest.fn().mockResolvedValue([]) },
        },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('should return cached overview with fromCache=true on cache hit', async () => {
    const cachedOverview: any = {
      totalIncidents: 42,
      openIncidents: 10,
      criticalIncidents: 4,
      mitigatedIncidents: 5,
      resolvedIncidents: 27,
      severityBreakdown: { P1: 2, P2: 2, P3: 20, P4: 18 },
      statusBreakdown: { OPEN: 10, INVESTIGATING: 5, MITIGATED: 5, RESOLVED: 22 },
      serviceBreakdown: {},
      teamWorkload: [],
      aiOverview: {
        total: 15,
        queued: 0,
        running: 1,
        completed: 13,
        failed: 1,
        pendingApprovalActions: 2,
        executedActions: 5,
        rejectedActions: 1,
        avgConfidence: 86,
        recentInvestigations: [],
      },
      recentIncidents: [],
      recentActivity: [],
      fromCache: false,
    };

    redisService.get.mockResolvedValue(cachedOverview);

    const result = await service.getOverview();

    expect(result.fromCache).toBe(true);
    expect(result.totalIncidents).toBe(42);
    expect(result.aiOverview.pendingApprovalActions).toBe(2);
    expect(incidentModel.countDocuments).not.toHaveBeenCalled();
  });

  it('should query MongoDB and store in Redis with 30s TTL on cache miss', async () => {
    redisService.get.mockResolvedValue(null);

    const result = await service.getOverview();

    expect(result.fromCache).toBe(false);
    expect(incidentModel.countDocuments).toHaveBeenCalled();
    expect(aiInvestigationModel.countDocuments).toHaveBeenCalled();
    expect(result.aiOverview).toBeDefined();
    expect(redisService.set).toHaveBeenCalledWith(
      CACHE_KEYS.DASHBOARD_OVERVIEW,
      expect.objectContaining({ totalIncidents: 50, aiOverview: expect.any(Object) }),
      CACHE_TTLS.DASHBOARD, // 30 seconds
    );
  });
});
