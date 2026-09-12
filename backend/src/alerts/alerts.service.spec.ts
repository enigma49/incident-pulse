import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AlertsService } from './alerts.service';
import { Alert, AlertStatus } from './schemas/alert.schema';
import { Incident, IncidentStatus, IncidentSeverity } from '../incidents/schemas/incident.schema';
import { AuditService } from '../audit/audit.service';
import { RedisService } from '../common/redis/redis.service';
import { EventsGateway } from '../events/events.gateway';

describe('AlertsService - Ingestion, Correlation & Escalation', () => {
  let service: AlertsService;
  let alertModel: any;
  let incidentModel: any;
  let auditService: any;
  let redisService: any;
  let eventsGateway: any;

  beforeEach(async () => {
    // Model mocks
    alertModel = jest.fn().mockImplementation((data) => ({
      ...data,
      _id: new Types.ObjectId(),
      save: jest.fn().mockImplementation(function () {
        return Promise.resolve(this);
      }),
    }));
    alertModel.findOne = jest.fn();
    alertModel.findById = jest.fn();
    alertModel.find = jest.fn();
    alertModel.countDocuments = jest.fn();

    incidentModel = jest.fn().mockImplementation((data) => ({
      ...data,
      _id: new Types.ObjectId(),
      save: jest.fn().mockImplementation(function () {
        return Promise.resolve(this);
      }),
    }));
    incidentModel.findOne = jest.fn();
    incidentModel.findById = jest.fn();

    auditService = {
      logEvent: jest.fn().mockResolvedValue({} as any),
    };

    redisService = {
      invalidateIncident: jest.fn().mockResolvedValue(undefined),
      invalidateDashboard: jest.fn().mockResolvedValue(undefined),
    };

    eventsGateway = {
      emitAlertAssociated: jest.fn(),
      emitIncidentCreated: jest.fn(),
      emitIncidentSeverityChanged: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: getModelToken(Alert.name), useValue: alertModel },
        { provide: getModelToken(Incident.name), useValue: incidentModel },
        { provide: AuditService, useValue: auditService },
        { provide: RedisService, useValue: redisService },
        { provide: EventsGateway, useValue: eventsGateway },
      ],
    }).compile();

    service = module.get<AlertsService>(AlertsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Severity normalization and weighting', () => {
    it('should correctly normalize severity aliases', () => {
      expect(service.normalizeSeverity('CRITICAL')).toBe(IncidentSeverity.P1);
      expect(service.normalizeSeverity('high')).toBe(IncidentSeverity.P2);
      expect(service.normalizeSeverity('medium')).toBe(IncidentSeverity.P3);
      expect(service.normalizeSeverity('low')).toBe(IncidentSeverity.P4);
      expect(service.normalizeSeverity('P1')).toBe(IncidentSeverity.P1);
      expect(service.normalizeSeverity('UNKNOWN')).toBe(IncidentSeverity.P3);
    });

    it('should assign lower weights to higher severity levels', () => {
      expect(service.severityWeight(IncidentSeverity.P1)).toBeLessThan(
        service.severityWeight(IncidentSeverity.P2),
      );
      expect(service.severityWeight(IncidentSeverity.P2)).toBeLessThan(
        service.severityWeight(IncidentSeverity.P3),
      );
      expect(service.severityWeight(IncidentSeverity.P3)).toBeLessThan(
        service.severityWeight(IncidentSeverity.P4),
      );
    });
  });

  describe('Deduplication logic', () => {
    it('should deduplicate alerts with identical fingerprint within 5 minutes', async () => {
      const existingAlertDoc = {
        _id: new Types.ObjectId(),
        title: 'High CPU Usage',
        service: 'order-service',
        count: 1,
        lastSeenAt: new Date(),
        incidentId: new Types.ObjectId(),
        save: jest.fn().mockResolvedValue(true),
      };

      alertModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(existingAlertDoc),
        }),
      });

      const result = await service.ingest({
        title: 'High CPU Usage',
        severity: 'P2',
        service: 'order-service',
      });

      expect(result.deduplicated).toBe(true);
      expect(result.action).toBe('DEDUPLICATED');
      expect(existingAlertDoc.count).toBe(2);
      expect(existingAlertDoc.save).toHaveBeenCalled();
      // No new incident or new alert should be created
      expect(incidentModel).not.toHaveBeenCalled();
    });

    it('should escalate severity based on frequency count threshold', async () => {
      const existingAlertDoc = {
        _id: new Types.ObjectId(),
        title: 'Minor Memory Warning',
        service: 'payment-service',
        severity: IncidentSeverity.P4,
        count: 4, // 5th alert triggers >= 5 threshold (P3)
        lastSeenAt: new Date(),
        incidentId: null,
        save: jest.fn().mockResolvedValue(true),
      };

      alertModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(existingAlertDoc),
        }),
      });

      const result = await service.ingest({
        title: 'Minor Memory Warning',
        severity: 'P4',
        service: 'payment-service',
      });

      expect(result.deduplicated).toBe(true);
      expect(result.escalated).toBe(true);
      expect(existingAlertDoc.count).toBe(5);
      expect(existingAlertDoc.severity).toBe(IncidentSeverity.P3);
    });
  });

  describe('Correlation to existing active incident', () => {
    it('should correlate to active incident on same service and NOT create new incident', async () => {
      // Dedupe check returns null (not a duplicate)
      alertModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      const existingIncidentId = new Types.ObjectId();
      const existingIncidentDoc = {
        _id: existingIncidentId,
        service: 'auth-service',
        severity: IncidentSeverity.P2,
        status: IncidentStatus.INVESTIGATING,
        save: jest.fn().mockResolvedValue(true),
      };

      // Active incident found in 30-minute window
      incidentModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(existingIncidentDoc),
        }),
      });

      const result = await service.ingest({
        title: 'Token Verification Failed',
        severity: 'P3', // lower than P2 -> no escalation
        service: 'auth-service',
      });

      expect(result.action).toBe('CORRELATED_TO_EXISTING');
      expect(result.escalated).toBe(false);
      expect(result.incident._id).toEqual(existingIncidentId);
      expect(eventsGateway.emitAlertAssociated).toHaveBeenCalledWith(
        existingIncidentId.toString(),
        expect.anything(),
      );
      expect(redisService.invalidateIncident).toHaveBeenCalledWith(
        existingIncidentId.toString(),
      );
      // Incident severity should remain P2
      expect(existingIncidentDoc.severity).toBe(IncidentSeverity.P2);
    });

    it('should escalate incident severity if incoming alert is more severe', async () => {
      alertModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      const existingIncidentId = new Types.ObjectId();
      const existingIncidentDoc = {
        _id: existingIncidentId,
        service: 'payment-gateway',
        severity: IncidentSeverity.P3, // current severity is P3
        status: IncidentStatus.OPEN,
        save: jest.fn().mockResolvedValue(true),
      };

      incidentModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(existingIncidentDoc),
        }),
      });

      // Incoming alert is P1 (Critical)
      const result = await service.ingest({
        title: 'Complete Gateway 504 Failure',
        severity: 'CRITICAL',
        service: 'payment-gateway',
      });

      expect(result.action).toBe('CORRELATED_TO_EXISTING');
      expect(result.escalated).toBe(true);
      expect(existingIncidentDoc.severity).toBe(IncidentSeverity.P1);
      expect(existingIncidentDoc.save).toHaveBeenCalled();
      expect(eventsGateway.emitIncidentSeverityChanged).toHaveBeenCalledWith(
        existingIncidentDoc,
      );
      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SEVERITY_CHANGED',
          metadata: expect.objectContaining({
            oldSeverity: IncidentSeverity.P3,
            newSeverity: IncidentSeverity.P1,
          }),
        }),
      );
    });
  });

  describe('Automatic Incident Creation', () => {
    it('should create a new incident when no active incident exists in the 30-min window', async () => {
      // Dedupe check returns null
      alertModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      // No active incident found
      incidentModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      const result = await service.ingest({
        title: 'Redis Node Out of Memory',
        severity: 'P2',
        service: 'cache-cluster',
        description: 'Memory usage hit 98%',
      });

      expect(result.action).toBe('CREATED_NEW_INCIDENT');
      expect(result.escalated).toBe(false);
      expect(incidentModel).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'cache-cluster',
          severity: IncidentSeverity.P2,
          status: IncidentStatus.OPEN,
        }),
      );
      expect(eventsGateway.emitIncidentCreated).toHaveBeenCalled();
      expect(eventsGateway.emitAlertAssociated).toHaveBeenCalled();
      expect(redisService.invalidateDashboard).toHaveBeenCalled();
    });
  });

  describe('Manual Association', () => {
    it('should manually associate an unassigned alert with an existing incident', async () => {
      const alertId = new Types.ObjectId();
      const mockAlertDoc = {
        _id: alertId,
        title: 'High latency',
        incidentId: null,
        status: AlertStatus.UNASSIGNED,
        save: jest.fn().mockResolvedValue(true),
      };

      const incidentId = new Types.ObjectId();
      const mockIncidentDoc = {
        _id: incidentId,
        title: 'Network latency spike',
      };

      alertModel.findById.mockResolvedValue(mockAlertDoc);
      incidentModel.findById.mockResolvedValue(mockIncidentDoc);

      const result = await service.associate(
        alertId.toString(),
        { incidentId: incidentId.toString() },
        { role: 'OPERATOR', userId: 'user-1' },
      );

      expect(mockAlertDoc.incidentId).toEqual(incidentId);
      expect(mockAlertDoc.status).toBe(AlertStatus.CORRELATED);
      expect(eventsGateway.emitAlertAssociated).toHaveBeenCalledWith(
        incidentId.toString(),
        mockAlertDoc,
      );
      expect(redisService.invalidateIncident).toHaveBeenCalledWith(
        incidentId.toString(),
      );
    });
  });
});

