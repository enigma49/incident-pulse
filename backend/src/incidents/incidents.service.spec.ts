import { Test, TestingModule } from '@nestjs/testing';
import { IncidentsService } from './incidents.service';
import { getModelToken } from '@nestjs/mongoose';
import { Incident, IncidentSeverity, IncidentStatus } from './schemas/incident.schema';
import { Alert } from '../alerts/schemas/alert.schema';
import { Comment } from '../comments/schemas/comment.schema';
import { Task } from '../tasks/schemas/task.schema';
import { AIInvestigation } from '../ai/schemas/ai-investigation.schema';
import { AuditService } from '../audit/audit.service';
import { Types } from 'mongoose';

describe('IncidentsService', () => {
  let service: IncidentsService;
  let incidentModel: any;
  let alertModel: any;
  let commentModel: any;
  let taskModel: any;
  let aiInvestigationModel: any;
  let auditService: jest.Mocked<Partial<AuditService>>;

  const mockIncident = {
    _id: new Types.ObjectId(),
    title: 'High error rate on gateway',
    description: 'Elevated 502s',
    severity: IncidentSeverity.P1,
    status: IncidentStatus.OPEN,
    service: 'gateway',
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
      }),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentsService,
        { provide: getModelToken(Incident.name), useValue: incidentModel },
        { provide: getModelToken(Alert.name), useValue: alertModel },
        { provide: getModelToken(Comment.name), useValue: commentModel },
        { provide: getModelToken(Task.name), useValue: taskModel },
        { provide: getModelToken(AIInvestigation.name), useValue: aiInvestigationModel },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<IncidentsService>(IncidentsService);
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
        service: 'gateway',
      };
      const user = { userId: 'usr123', email: 'op@example.com', role: 'OPERATOR' };

      const result = await service.create(dto, user);

      expect(result).toBeDefined();
      expect(result.title).toBe(dto.title);
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

    it('should apply search regex across title, description, and service', async () => {
      const query = { search: 'gateway' };
      await service.findAll(query);

      expect(incidentModel.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: expect.arrayContaining([
            { title: expect.any(RegExp) },
            { description: expect.any(RegExp) },
            { service: expect.any(RegExp) },
          ]),
        }),
      );
    });
  });

  describe('findOne (Composite Detail)', () => {
    it('should fetch composite incident details with alerts, tasks, comments, and AI findings', async () => {
      const validId = new Types.ObjectId().toString();
      const result = await service.findOne(validId);

      expect(result).toHaveProperty('incident');
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
      incidentModel.findById.mockResolvedValue(incToResolve);

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

  describe('changeSeverity', () => {
    it('should update severity and record audit event', async () => {
      const incToChange = {
        ...mockIncident,
        severity: IncidentSeverity.P3,
        save: jest.fn().mockImplementation(function () {
          return Promise.resolve(this);
        }),
      };
      incidentModel.findById.mockResolvedValue(incToChange);

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
});

