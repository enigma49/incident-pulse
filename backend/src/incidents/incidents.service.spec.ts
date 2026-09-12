import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { IncidentsService } from './incidents.service';
import { getModelToken } from '@nestjs/mongoose';
import { Incident, IncidentSeverity, IncidentStatus } from './schemas/incident.schema';
import { Alert } from '../alerts/schemas/alert.schema';
import { Comment } from '../comments/schemas/comment.schema';
import { Task } from '../tasks/schemas/task.schema';
import { AIInvestigation } from '../ai/schemas/ai-investigation.schema';
import { AuditService } from '../audit/audit.service';
import { RedisService } from '../common/redis/redis.service';
import { EventsGateway } from '../events/events.gateway';
import { IncidentRefService } from './incident-ref.service';
import { Types } from 'mongoose';

describe('IncidentsService', () => {
  let service: IncidentsService;
  let incidentModel: any;
  let alertModel: any;
  let commentModel: any;
  let taskModel: any;
  let aiInvestigationModel: any;
  let auditService: jest.Mocked<Partial<AuditService>>;
  let eventsGateway: any;
  let incidentRefService: any;

  const mockIncident = {
    _id: new Types.ObjectId(),
    incidentNumber: 42,
    title: 'High error rate on gateway',
    description: 'Elevated 502s',
    severity: IncidentSeverity.P1,
    status: IncidentStatus.OPEN,
    services: ['gateway'],
    tags: ['edge', 'http'],
    save: jest.fn().mockImplementation(function () {
      return Promise.resolve(this);
    }),
    populate: jest.fn().mockReturnThis(),
  };

  beforeEach(async () => {
    // Mock Mongoose Query builder chain
    const mockQuery = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([mockIncident]),
    };

    incidentModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      _id: mockIncident._id,
      status: IncidentStatus.OPEN,
      save: jest.fn().mockResolvedValue({
        ...dto,
        _id: mockIncident._id,
        status: IncidentStatus.OPEN,
      }),
    }));

    incidentModel.countDocuments = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(42),
    });
    incidentModel.find = jest.fn().mockReturnValue(mockQuery);
    incidentModel.findById = jest.fn().mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockIncident),
        }),
      }),
    });
    incidentModel.findByIdAndUpdate = jest.fn().mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ ...mockIncident, title: 'Updated Title' }),
        }),
      }),
    });

    alertModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([{ title: 'Alert 1' }]),
        }),
        exec: jest.fn().mockResolvedValue([]),
      }),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
    };

    commentModel = {
      find: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([{ content: 'Triage ongoing' }]),
          }),
        }),
      }),
    };

    taskModel = {
      find: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([{ title: 'Scale workers' }]),
          }),
        }),
      }),
    };

    aiInvestigationModel = {
      findOne: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ summary: 'Identified bottleneck' }),
        }),
      }),
    };

    auditService = {
      logEvent: jest.fn().mockResolvedValue({} as any),
      findByIncidentId: jest.fn().mockResolvedValue([]),
    };

    incidentRefService = {
      getNextIncidentNumber: jest.fn().mockResolvedValue(42),
      findByRefOrThrow: jest.fn().mockImplementation(async (ref: string) => {
        if (ref === mockIncident._id.toString() || ref === 'INC-00042') {
          return mockIncident;
        }
        throw new Error(`Incident ${ref} not found`);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentsService,
        { provide: getModelToken(Incident.name), useValue: incidentModel },
        { provide: getModelToken(Alert.name), useValue: alertModel },
        { provide: getModelToken(Comment.name), useValue: commentModel },
        { provide: getModelToken(Task.name), useValue: taskModel },
        { provide: getModelToken(AIInvestigation.name), useValue: aiInvestigationModel },
        { provide: AuditService, useValue: auditService },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
            invalidateIncident: jest.fn().mockResolvedValue(undefined),
            invalidateDashboard: jest.fn().mockResolvedValue(undefined),
          },
        },
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
    eventsGateway = module.get<EventsGateway>(EventsGateway);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an incident and record an audit event', async () => {
      const dto = {
        title: 'High error rate on gateway',
        description: 'Elevated 502s',
        severity: IncidentSeverity.P1,
        services: ['gateway'],
      };
      const user = { userId: 'usr123', email: 'op@example.com', role: 'OPERATOR' };

      const result = await service.create(dto, user);

      expect(result).toBeDefined();
      expect(result.title).toBe(dto.title);
      expect(result.incidentNumber).toBe(42);
      expect(result.status).toBe(IncidentStatus.OPEN);
      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INCIDENT_CREATED',
          entity: 'Incident',
        }),
      );
    });
  });

  describe('findAll (Pagination & Filtering)', () => {
    it('should paginate at the database layer using skip, limit, and countDocuments', async () => {
      const query = { page: 2, limit: 10, status: IncidentStatus.OPEN };

      const result = await service.findAll(query);

      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.total).toBe(42);
      expect(result.totalPages).toBe(5);
      expect(incidentModel.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ status: IncidentStatus.OPEN }),
      );
      expect(incidentModel.find).toHaveBeenCalled();
    });

    it('should apply search regex across title, description, and services', async () => {
      const query = { search: 'gateway' };
      await service.findAll(query);

      expect(incidentModel.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: expect.arrayContaining([
            { title: expect.any(RegExp) },
            { description: expect.any(RegExp) },
            { services: expect.any(RegExp) },
          ]),
        }),
      );
    });

    it('should match services array for queue filters', async () => {
      await service.findAll({ service: 'payment-service' });

      expect(incidentModel.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({
          services: 'payment-service',
        }),
      );
    });

    it('should combine service filter with search using $and', async () => {
      await service.findAll({ service: 'payment-service', search: 's3' });

      expect(incidentModel.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({
          services: 'payment-service',
          $or: expect.arrayContaining([
            { title: expect.any(RegExp) },
            { description: expect.any(RegExp) },
            { services: expect.any(RegExp) },
          ]),
        }),
      );
    });
  });

  describe('findOne (Composite Detail)', () => {
    it('should fetch composite incident details with alerts, tasks, comments, and AI findings', async () => {
      const result = await service.findOne(mockIncident._id.toString());

      expect(result).toHaveProperty('incident');
      expect(result).toHaveProperty('relatedIncidents');
      expect(result).toHaveProperty('mergedInto');
      expect(result).toHaveProperty('alerts');
      expect(result).toHaveProperty('tasks');
      expect(result).toHaveProperty('comments');
      expect(result).toHaveProperty('auditEvents');
      expect(result).toHaveProperty('aiInvestigation');
    });
  });

  describe('changeStatus', () => {
    it('should update status, set resolvedAt when RESOLVED, and log audit event', async () => {
      const incToResolve = {
        ...mockIncident,
        status: IncidentStatus.INVESTIGATING,
        save: jest.fn().mockImplementation(function () {
          return Promise.resolve(this);
        }),
      };
      incidentRefService.findByRefOrThrow.mockResolvedValueOnce(incToResolve);

      const user = { userId: 'usr123', email: 'op@example.com', role: 'OPERATOR' };
      const updated = await service.changeStatus(
        mockIncident._id.toString(),
        IncidentStatus.RESOLVED,
        user,
      );

      expect(updated.status).toBe(IncidentStatus.RESOLVED);
      expect(updated.resolvedAt).toBeInstanceOf(Date);
      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STATUS_CHANGED',
          metadata: {
            oldStatus: IncidentStatus.INVESTIGATING,
            newStatus: IncidentStatus.RESOLVED,
          },
        }),
      );
    });
  });

  describe('relate and merge', () => {
    it('should relate two incidents bidirectionally', async () => {
      const sourceId = new Types.ObjectId();
      const targetId = new Types.ObjectId();
      const source = {
        _id: sourceId,
        incidentNumber: 10,
        status: IncidentStatus.OPEN,
        relatedIncidentIds: [],
        save: jest.fn().mockImplementation(function () {
          return Promise.resolve(this);
        }),
      };
      const target = {
        _id: targetId,
        incidentNumber: 11,
        status: IncidentStatus.INVESTIGATING,
        relatedIncidentIds: [],
        save: jest.fn().mockImplementation(function () {
          return Promise.resolve(this);
        }),
      };

      incidentRefService.findByRefOrThrow
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(target);
      incidentModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([target]),
        }),
      });

      const result = await service.relate(sourceId.toString(), { incidentId: 'INC-00011' }, {
        userId: 'op-1',
        role: 'OPERATOR',
      });

      expect(source.relatedIncidentIds).toContainEqual(targetId);
      expect(target.relatedIncidentIds).toContainEqual(sourceId);
      expect(result.relatedIncidents).toHaveLength(1);
      expect(eventsGateway.emitIncidentUpdated).toHaveBeenCalled();
    });

    it('should reject relating an incident to itself', async () => {
      const sourceId = new Types.ObjectId();
      const source = {
        _id: sourceId,
        status: IncidentStatus.OPEN,
        relatedIncidentIds: [],
        save: jest.fn(),
      };
      incidentRefService.findByRefOrThrow.mockResolvedValue(source);

      await expect(
        service.relate(sourceId.toString(), { incidentId: sourceId.toString() }, {
          userId: 'op-1',
          role: 'OPERATOR',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should merge source incident into target', async () => {
      const sourceId = new Types.ObjectId();
      const targetId = new Types.ObjectId();
      const source: any = {
        _id: sourceId,
        incidentNumber: 20,
        status: IncidentStatus.OPEN,
        severity: IncidentSeverity.P2,
        services: ['auth-service'],
        relatedIncidentIds: [],
        mergedIntoId: null,
        tags: [],
        save: jest.fn().mockImplementation(function () {
          return Promise.resolve(this);
        }),
      };
      const target = {
        _id: targetId,
        incidentNumber: 21,
        status: IncidentStatus.OPEN,
        severity: IncidentSeverity.P3,
        services: ['payment-service'],
        relatedIncidentIds: [],
        save: jest.fn().mockImplementation(function () {
          return Promise.resolve(this);
        }),
      };

      incidentRefService.findByRefOrThrow
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(target);
      alertModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { service: 'auth-service' },
        ]),
      });
      alertModel.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 });

      const result = await service.merge(sourceId.toString(), { targetIncidentId: 'INC-00021' }, {
        userId: 'op-1',
        role: 'OPERATOR',
      });

      expect(source.status).toBe(IncidentStatus.RESOLVED);
      expect(source.mergedIntoId).toEqual(targetId);
      expect(target.services).toEqual(['payment-service', 'auth-service']);
      expect(target.severity).toBe(IncidentSeverity.P2);
      expect(alertModel.updateMany).toHaveBeenCalled();
      expect(result.target._id).toEqual(targetId);
    });
  });

  describe('changeSeverity', () => {
    it('should update severity and record audit event', async () => {
      const incToChange = {
        ...mockIncident,
        severity: IncidentSeverity.P3,
        save: jest.fn().mockImplementation(function () {
          return Promise.resolve(this);
        }),
      };
      incidentRefService.findByRefOrThrow.mockResolvedValueOnce(incToChange);

      const user = { userId: 'usr123', email: 'op@example.com', role: 'OPERATOR' };
      const updated = await service.changeSeverity(
        mockIncident._id.toString(),
        IncidentSeverity.P1,
        user,
      );

      expect(updated.severity).toBe(IncidentSeverity.P1);
      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SEVERITY_CHANGED',
          metadata: {
            oldSeverity: IncidentSeverity.P3,
            newSeverity: IncidentSeverity.P1,
          },
        }),
      );
    });
  });

  describe('assign (operator restrictions)', () => {
    const operatorId = new Types.ObjectId();
    const operator = {
      userId: operatorId.toString(),
      email: 'op@example.com',
      role: 'OPERATOR',
    };
    const admin = { userId: 'admin-1', email: 'admin@example.com', role: 'ADMIN' };

    const buildIncident = (assigneeId: Types.ObjectId | null = null) => {
      const inc: any = {
        ...mockIncident,
        assigneeId,
        teamId: null,
        save: jest.fn().mockImplementation(function () {
          return Promise.resolve(this);
        }),
      };
      inc.populate = jest.fn().mockResolvedValue(inc);
      return inc;
    };

    it('allows operator to self-assign', async () => {
      const inc = buildIncident(null);
      incidentRefService.findByRefOrThrow.mockResolvedValueOnce(inc);

      await service.assign(
        inc._id.toString(),
        { assigneeId: operator.userId },
        operator,
      );

      expect(inc.assigneeId?.toString()).toBe(operator.userId);
    });

    it('rejects operator assigning another user', async () => {
      const otherId = new Types.ObjectId().toString();
      const inc = buildIncident(null);
      incidentRefService.findByRefOrThrow.mockResolvedValueOnce(inc);

      await expect(
        service.assign(inc._id.toString(), { assigneeId: otherId }, operator),
      ).rejects.toThrow(/only assign incidents to themselves/);
    });

    it('rejects operator changing team', async () => {
      const teamId = new Types.ObjectId().toString();
      const inc = buildIncident(null);
      incidentRefService.findByRefOrThrow.mockResolvedValueOnce(inc);

      await expect(
        service.assign(inc._id.toString(), { teamId }, operator),
      ).rejects.toThrow(/not allowed to set or change the assigned team/);
    });

    it('allows operator to unassign self', async () => {
      const inc = buildIncident(operatorId);
      incidentRefService.findByRefOrThrow.mockResolvedValueOnce(inc);

      await service.assign(inc._id.toString(), { assigneeId: '' }, operator);

      expect(inc.assigneeId).toBeNull();
    });

    it('allows admin to assign any user and team', async () => {
      const assigneeId = new Types.ObjectId().toString();
      const teamId = new Types.ObjectId().toString();
      const inc = buildIncident(null);
      incidentRefService.findByRefOrThrow.mockResolvedValueOnce(inc);

      await service.assign(inc._id.toString(), { assigneeId, teamId }, admin);

      expect(inc.assigneeId?.toString()).toBe(assigneeId);
      expect(inc.teamId?.toString()).toBe(teamId);
    });

    it('rejects operator setting team or assignee on create', async () => {
      await expect(
        service.create(
          {
            title: 't',
            description: 'd',
            severity: IncidentSeverity.P3,
            services: ['gateway'],
            teamId: new Types.ObjectId().toString(),
          },
          operator,
        ),
      ).rejects.toThrow(/not allowed to set or change the assigned team/);
    });
  });
});

