import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { BadRequestException } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { Alert, AlertStatus } from './schemas/alert.schema';
import { Incident, IncidentStatus, IncidentSeverity } from '../incidents/schemas/incident.schema';
import { AuditService } from '../audit/audit.service';
import { RedisService } from '../common/redis/redis.service';
import { EventsGateway } from '../events/events.gateway';
import { IncidentRefService } from '../incidents/incident-ref.service';

describe('AlertsService - Ingestion, Correlation & Escalation', () => {
  let service: AlertsService;
  let alertModel: any;
  let incidentModel: any;
  let auditService: any;
  let redisService: any;
  let eventsGateway: any;
  let incidentRefService: any;

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

    incidentRefService = {
      getNextIncidentNumber: jest.fn().mockResolvedValue(99),
      findByRefOrThrow: jest.fn().mockImplementation(async (ref: string) => {
        const incident = await incidentModel.findById(ref);
        if (!incident) {
          throw new Error(`Incident ${ref} not found`);
        }
        return incident;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: getModelToken(Alert.name), useValue: alertModel },
        { provide: getModelToken(Incident.name), useValue: incidentModel },
        { provide: AuditService, useValue: auditService },
        { provide: RedisService, useValue: redisService },
        { provide: EventsGateway, useValue: eventsGateway },
        { provide: IncidentRefService, useValue: incidentRefService },
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
        services: ['auth-service'],
        correlationKey: 'service:auth-service',
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
        services: ['payment-gateway'],
        correlationKey: 'service:payment-gateway',
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
          correlationKey: 'resource:redis',
          services: ['cache-cluster'],
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
        service: 'order-service',
        incidentId: null,
        status: AlertStatus.UNASSIGNED,
        save: jest.fn().mockResolvedValue(true),
      };

      const incidentId = new Types.ObjectId();
      const mockIncidentDoc = {
        _id: incidentId,
        title: 'Network latency spike',
        status: IncidentStatus.OPEN,
        services: ['gateway'],
        save: jest.fn().mockResolvedValue(true),
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
      expect(mockIncidentDoc.services).toContain('order-service');
    });

    it('should resolve INC-xxxx and grow services on a non-OPEN ticket', async () => {
      const alertId = new Types.ObjectId();
      const mockAlertDoc = {
        _id: alertId,
        title: 'S3 timeouts',
        service: 'order-service',
        incidentId: null,
        status: AlertStatus.UNASSIGNED,
        save: jest.fn().mockResolvedValue(true),
      };
      const incidentId = new Types.ObjectId();
      const mockIncidentDoc = {
        _id: incidentId,
        status: IncidentStatus.INVESTIGATING,
        services: ['payment-service'],
        save: jest.fn().mockResolvedValue(true),
      };

      alertModel.findById.mockResolvedValue(mockAlertDoc);
      incidentRefService.findByRefOrThrow.mockResolvedValue(mockIncidentDoc);

      await service.associate(
        alertId.toString(),
        { incidentId: 'INC-01042' },
        { role: 'OPERATOR', userId: 'user-1' },
      );

      expect(incidentRefService.findByRefOrThrow).toHaveBeenCalledWith('INC-01042');
      expect(mockIncidentDoc.services).toEqual(['payment-service', 'order-service']);
      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ALERT_CORRELATED',
          metadata: expect.objectContaining({ manual: true }),
        }),
      );
    });

    it('should reject associating an alert to a resolved incident', async () => {
      const alertId = new Types.ObjectId();
      alertModel.findById.mockResolvedValue({
        _id: alertId,
        title: 'High latency',
        service: 'order-service',
        save: jest.fn(),
      });
      incidentRefService.findByRefOrThrow.mockResolvedValue({
        _id: new Types.ObjectId(),
        status: IncidentStatus.RESOLVED,
        services: [],
        save: jest.fn(),
      });

      await expect(
        service.associate(alertId.toString(), { incidentId: 'INC-00007' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('Cross-service resource clustering', () => {
    const mockNoDuplicate = () => {
      alertModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });
    };

    const installIncidentStore = () => {
      const incidents: any[] = [];
      incidentModel.mockImplementation((data) => {
        const doc = {
          ...data,
          _id: new Types.ObjectId(),
          status: data.status || IncidentStatus.OPEN,
          services: [...(data.services || [])],
          save: jest.fn().mockImplementation(function () {
            return Promise.resolve(this);
          }),
        };
        incidents.push(doc);
        return doc;
      });
      incidentModel.findOne.mockImplementation((query: any) => ({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockImplementation(async () => {
            const matches = incidents.filter((incident) => {
              if (query.correlationKey && incident.correlationKey !== query.correlationKey) {
                return false;
              }
              if (query.status?.$ne && incident.status === query.status.$ne) {
                return false;
              }
              return true;
            });
            return matches[matches.length - 1] || null;
          }),
        }),
      }));
      return incidents;
    };

    it('clusters S3 alerts from three services onto one incident', async () => {
      mockNoDuplicate();
      installIncidentStore();

      const first = await service.ingest({
        title: 'S3 PutObject timeouts',
        severity: 'P2',
        service: 'payment-service',
      });
      const second = await service.ingest({
        title: 'S3 GetObject 503',
        severity: 'P2',
        service: 'auth-service',
      });
      const third = await service.ingest({
        title: 'S3 ListBuckets failed',
        severity: 'P1',
        service: 'order-service',
      });

      expect(first.action).toBe('CREATED_NEW_INCIDENT');
      expect(second.action).toBe('CORRELATED_TO_EXISTING');
      expect(third.action).toBe('CORRELATED_TO_EXISTING');
      expect(second.incident._id).toEqual(first.incident._id);
      expect(third.incident._id).toEqual(first.incident._id);
      expect(third.incident.services).toEqual([
        'payment-service',
        'auth-service',
        'order-service',
      ]);
      expect(third.incident.title).toBe(
        '[Incident] Shared dependency s3 impacting payment-service, auth-service, order-service',
      );
      expect(third.incident.severity).toBe(IncidentSeverity.P1);
      expect(incidentModel).toHaveBeenCalledTimes(1);
    });

    it('keeps High CPU alerts on different services isolated', async () => {
      mockNoDuplicate();
      installIncidentStore();

      const first = await service.ingest({
        title: 'High CPU',
        severity: 'P3',
        service: 'auth-service',
      });
      const second = await service.ingest({
        title: 'High CPU',
        severity: 'P3',
        service: 'payment-service',
      });

      expect(first.action).toBe('CREATED_NEW_INCIDENT');
      expect(second.action).toBe('CREATED_NEW_INCIDENT');
      expect(first.incident._id).not.toEqual(second.incident._id);
      expect(first.incident.correlationKey).toBe('service:auth-service');
      expect(second.incident.correlationKey).toBe('service:payment-service');
      expect(incidentModel).toHaveBeenCalledTimes(2);
    });

    it('still correlates same-service alerts when no resource is present', async () => {
      mockNoDuplicate();
      installIncidentStore();

      const first = await service.ingest({
        title: 'High CPU',
        severity: 'P3',
        service: 'auth-service',
      });
      const second = await service.ingest({
        title: 'Memory pressure',
        severity: 'P3',
        service: 'auth-service',
      });

      expect(first.action).toBe('CREATED_NEW_INCIDENT');
      expect(second.action).toBe('CORRELATED_TO_EXISTING');
      expect(second.incident._id).toEqual(first.incident._id);
      expect(second.incident.services).toEqual(['auth-service']);
    });

    it('opens a new incident after the previous S3 cluster is resolved', async () => {
      mockNoDuplicate();
      const incidents = installIncidentStore();

      const first = await service.ingest({
        title: 'S3 PutObject timeouts',
        severity: 'P2',
        service: 'payment-service',
      });
      incidents[0].status = IncidentStatus.RESOLVED;

      const second = await service.ingest({
        title: 'S3 GetObject 503',
        severity: 'P2',
        service: 'auth-service',
      });

      expect(first.action).toBe('CREATED_NEW_INCIDENT');
      expect(second.action).toBe('CREATED_NEW_INCIDENT');
      expect(second.incident._id).not.toEqual(first.incident._id);
      expect(incidentModel).toHaveBeenCalledTimes(2);
    });
  });
});

