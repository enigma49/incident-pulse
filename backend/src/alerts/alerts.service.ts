import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { Alert, AlertDocument, AlertStatus } from './schemas/alert.schema';
import { Incident, IncidentDocument, IncidentStatus, IncidentSeverity } from '../incidents/schemas/incident.schema';
import { AuditService } from '../audit/audit.service';
import { ActorType } from '../audit/schemas/audit-event.schema';
import { RedisService } from '../common/redis/redis.service';
import { EventsGateway } from '../events/events.gateway';
import { CreateAlertDto, QueryAlertsDto, AssociateAlertDto } from './dto/alert.dto';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
    @InjectModel(Incident.name) private incidentModel: Model<IncidentDocument>,
    private auditService: AuditService,
    private redisService: RedisService,
    private eventsGateway: EventsGateway,
  ) {}

  /**
   * Normalizes incoming alert severity strings to P1-P4
   */
  normalizeSeverity(sev: string): IncidentSeverity {
    const s = (sev || '').toUpperCase().trim();
    if (s === 'P1' || s === 'CRITICAL') return IncidentSeverity.P1;
    if (s === 'P2' || s === 'HIGH') return IncidentSeverity.P2;
    if (s === 'P3' || s === 'MEDIUM') return IncidentSeverity.P3;
    if (s === 'P4' || s === 'LOW' || s === 'INFO') return IncidentSeverity.P4;
    return IncidentSeverity.P3;
  }

  /**
   * Severity priority weight: lower number = higher priority
   */
  severityWeight(sev: string): number {
    switch (sev) {
      case IncidentSeverity.P1:
      case 'CRITICAL':
        return 1;
      case IncidentSeverity.P2:
      case 'HIGH':
        return 2;
      case IncidentSeverity.P3:
      case 'MEDIUM':
        return 3;
      case IncidentSeverity.P4:
      case 'LOW':
      case 'INFO':
        return 4;
      default:
        return 3;
    }
  }

  /**
   * Generates deterministic fingerprint based on service, title, and source
   */
  calculateFingerprint(service: string, title: string, source?: string): string {
    const raw = `${(service || '').toLowerCase().trim()}:${(title || '').toLowerCase().trim()}:${(source || 'prometheus').toLowerCase().trim()}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Ingest an incoming alert:
   * 1. Deduplication check within 5 minutes
   * 2. Deterministic correlation to active incidents within 30-minute window
   * 3. Automatic severity escalation if incoming alert is more severe
   * 4. Spawns a new incident if no active cluster matches
   */
  async ingest(dto: CreateAlertDto, currentUser?: any) {
    const normalizedSeverity = this.normalizeSeverity(dto.severity);
    const fingerprint = this.calculateFingerprint(dto.service, dto.title, dto.source);

    // 1. Deduplication check (5-minute sliding window)
    const dedupeWindow = new Date(Date.now() - 5 * 60 * 1000);
    const existingAlert = await this.alertModel
      .findOne({
        fingerprint,
        timestamp: { $gte: dedupeWindow },
      })
      .sort({ timestamp: -1 })
      .exec();

    if (existingAlert) {
      existingAlert.count = (existingAlert.count || 1) + 1;
      existingAlert.lastSeenAt = new Date();

      // Check for severity escalation due to frequency count or incoming severity
      const oldAlertSeverity: IncidentSeverity =
        (existingAlert.severity as IncidentSeverity) || IncidentSeverity.P3;
      let newAlertSeverity: IncidentSeverity =
        (existingAlert.severity as IncidentSeverity) || IncidentSeverity.P3;

      // 1. If incoming payload has higher severity (lower weight)
      if (this.severityWeight(normalizedSeverity) < this.severityWeight(newAlertSeverity)) {
        newAlertSeverity = normalizedSeverity;
      }

      // 2. Frequency threshold escalation:
      // Count >= 30 => P1 (Critical)
      // Count >= 15 => P2 (High)
      // Count >= 5  => P3 (Medium)
      if (existingAlert.count >= 30 && this.severityWeight(newAlertSeverity) > this.severityWeight(IncidentSeverity.P1)) {
        newAlertSeverity = IncidentSeverity.P1;
      } else if (existingAlert.count >= 15 && this.severityWeight(newAlertSeverity) > this.severityWeight(IncidentSeverity.P2)) {
        newAlertSeverity = IncidentSeverity.P2;
      } else if (existingAlert.count >= 5 && this.severityWeight(newAlertSeverity) > this.severityWeight(IncidentSeverity.P3)) {
        newAlertSeverity = IncidentSeverity.P3;
      }

      let alertEscalated = false;
      if (newAlertSeverity !== oldAlertSeverity) {
        existingAlert.severity = newAlertSeverity;
        alertEscalated = true;
        this.logger.log(
          `[Alert Ingest] Alert "${existingAlert.title}" frequency-escalated from ${oldAlertSeverity} to ${newAlertSeverity} (Count: ${existingAlert.count})`,
        );
      }

      await existingAlert.save();

      // If linked to an active incident, escalate incident severity if alert is now more severe
      let incidentEscalated = false;
      if (existingAlert.incidentId && typeof this.incidentModel.findById === 'function') {
        const query = this.incidentModel.findById(existingAlert.incidentId);
        const linkedIncident = query?.exec ? await query.exec() : await query;
        if (linkedIncident && linkedIncident.status !== IncidentStatus.RESOLVED) {
          if (this.severityWeight(newAlertSeverity) < this.severityWeight(linkedIncident.severity)) {
            const oldIncidentSev = linkedIncident.severity;
            linkedIncident.severity = newAlertSeverity;
            await linkedIncident.save();
            incidentEscalated = true;

            this.logger.log(
              `[Correlation Escalation] Incident ${linkedIncident._id} escalated from ${oldIncidentSev} to ${newAlertSeverity} by recurring alert "${existingAlert.title}" (Count: ${existingAlert.count})`,
            );

            await this.auditService.logEvent({
              incidentId: linkedIncident._id,
              actorType: ActorType.SYSTEM,
              actorId: 'correlation-engine',
              action: 'SEVERITY_CHANGED',
              entity: 'Incident',
              entityId: linkedIncident._id.toString(),
              metadata: {
                reason: 'ALERT_FREQUENCY_ESCALATION',
                alertId: existingAlert._id.toString(),
                alertTitle: existingAlert.title,
                count: existingAlert.count,
                oldSeverity: oldIncidentSev,
                newSeverity: newAlertSeverity,
              },
            });

            this.eventsGateway.emitIncidentSeverityChanged(linkedIncident);
            await this.redisService.invalidateIncident(linkedIncident._id.toString());
          }
        }
      }

      this.logger.log(
        `[Alert Ingest] Deduplicated alert "${dto.title}" on service "${dto.service}" (Count: ${existingAlert.count}, Severity: ${existingAlert.severity})`,
      );

      return {
        alert: existingAlert,
        deduplicated: true,
        incidentId: existingAlert.incidentId || null,
        action: 'DEDUPLICATED',
        escalated: alertEscalated || incidentEscalated,
      };
    }

    // 2. Persist new alert
    const alert = new this.alertModel({
      title: dto.title,
      description: dto.description || dto.title || 'No description provided.',
      severity: normalizedSeverity,
      service: dto.service,
      source: dto.source || 'Prometheus',
      rawPayload: dto.rawPayload || {},
      timestamp: dto.timestamp ? new Date(dto.timestamp) : new Date(),
      fingerprint,
      count: 1,
      lastSeenAt: new Date(),
      status: AlertStatus.UNASSIGNED,
    });

    const savedAlert = await alert.save();

    // 3. Deterministic correlation engine (30-minute time window on active incidents)
    const correlationWindow = new Date(Date.now() - 30 * 60 * 1000);
    const activeIncident = await this.incidentModel
      .findOne({
        service: dto.service,
        status: { $ne: IncidentStatus.RESOLVED },
        updatedAt: { $gte: correlationWindow },
      })
      .sort({ updatedAt: -1 })
      .exec();

    if (activeIncident) {
      // Correlate to existing active incident
      savedAlert.incidentId = activeIncident._id;
      savedAlert.status = AlertStatus.CORRELATED;
      await savedAlert.save();

      let escalated = false;
      const alertWeight = this.severityWeight(normalizedSeverity);
      const incidentWeight = this.severityWeight(activeIncident.severity);

      // Check for severity escalation (e.g. alert is P1, incident is P3)
      if (alertWeight < incidentWeight) {
        const oldSeverity = activeIncident.severity;
        activeIncident.severity = normalizedSeverity;
        await activeIncident.save();
        escalated = true;

        this.logger.log(
          `[Correlation Escalation] Incident ${activeIncident._id} escalated from ${oldSeverity} to ${normalizedSeverity} by alert "${savedAlert.title}"`,
        );

        await this.auditService.logEvent({
          incidentId: activeIncident._id,
          actorType: ActorType.SYSTEM,
          actorId: 'correlation-engine',
          action: 'SEVERITY_CHANGED',
          entity: 'Incident',
          entityId: activeIncident._id.toString(),
          metadata: {
            reason: 'ALERT_CORRELATION_ESCALATION',
            alertId: savedAlert._id.toString(),
            alertTitle: savedAlert.title,
            oldSeverity,
            newSeverity: normalizedSeverity,
          },
        });

        this.eventsGateway.emitIncidentSeverityChanged(activeIncident);
      }

      await this.auditService.logEvent({
        incidentId: activeIncident._id,
        actorType: ActorType.SYSTEM,
        actorId: 'correlation-engine',
        action: 'ALERT_CORRELATED',
        entity: 'Alert',
        entityId: savedAlert._id.toString(),
        metadata: {
          alertTitle: savedAlert.title,
          severity: savedAlert.severity,
          service: savedAlert.service,
          escalated,
        },
      });

      // Invalidate incident and dashboard caches
      await this.redisService.invalidateIncident(activeIncident._id.toString());

      // Emit realtime alert associated event
      this.eventsGateway.emitAlertAssociated(activeIncident._id.toString(), savedAlert);

      return {
        alert: savedAlert,
        incident: activeIncident,
        action: 'CORRELATED_TO_EXISTING',
        escalated,
      };
    } else {
      // 4. No active incident in correlation window -> Create new incident
      const newIncident = new this.incidentModel({
        title: `[Incident] ${savedAlert.title} (${savedAlert.service})`,
        description: `Automated incident created by correlation engine from incoming alert: ${savedAlert.title}\n\n${savedAlert.description || 'No description provided.'}`,
        severity: normalizedSeverity,
        service: savedAlert.service,
        status: IncidentStatus.OPEN,
        tags: ['auto-created', 'alert-cluster', savedAlert.service],
      });

      const savedIncident = await newIncident.save();

      savedAlert.incidentId = savedIncident._id;
      savedAlert.status = AlertStatus.CORRELATED;
      await savedAlert.save();

      await this.auditService.logEvent({
        incidentId: savedIncident._id,
        actorType: ActorType.SYSTEM,
        actorId: 'correlation-engine',
        action: 'INCIDENT_CREATED',
        entity: 'Incident',
        entityId: savedIncident._id.toString(),
        metadata: {
          createdFromAlertId: savedAlert._id.toString(),
          alertTitle: savedAlert.title,
          severity: savedAlert.severity,
          service: savedAlert.service,
        },
      });

      // Invalidate dashboard overview cache
      await this.redisService.invalidateDashboard();

      // Emit realtime events
      this.eventsGateway.emitIncidentCreated(savedIncident);
      this.eventsGateway.emitAlertAssociated(savedIncident._id.toString(), savedAlert);

      this.logger.log(
        `[Correlation Engine] Created new incident ${savedIncident._id} for alert "${savedAlert.title}" on service "${savedAlert.service}"`,
      );

      return {
        alert: savedAlert,
        incident: savedIncident,
        action: 'CREATED_NEW_INCIDENT',
        escalated: false,
      };
    }
  }

  /**
   * Manually associate an alert with an incident
   */
  async associate(alertId: string, dto: AssociateAlertDto, currentUser?: any) {
    const alert = await this.alertModel.findById(alertId);
    if (!alert) {
      throw new NotFoundException(`Alert ${alertId} not found`);
    }

    const incident = await this.incidentModel.findById(dto.incidentId);
    if (!incident) {
      throw new NotFoundException(`Incident ${dto.incidentId} not found`);
    }

    alert.incidentId = incident._id;
    alert.status = AlertStatus.CORRELATED;
    await alert.save();

    await this.auditService.logEvent({
      incidentId: incident._id,
      actorType: currentUser?.role ? ActorType.USER : ActorType.SYSTEM,
      actorId: currentUser?.userId || currentUser?.email || 'operator',
      action: 'ALERT_CORRELATED',
      entity: 'Alert',
      entityId: alert._id.toString(),
      metadata: {
        alertTitle: alert.title,
        manual: true,
      },
    });

    await this.redisService.invalidateIncident(incident._id.toString());
    this.eventsGateway.emitAlertAssociated(incident._id.toString(), alert);

    return { alert, incident };
  }

  /**
   * Manually unassociate an alert from an incident
   */
  async unassociate(alertId: string, currentUser?: any) {
    const alert = await this.alertModel.findById(alertId);
    if (!alert) {
      throw new NotFoundException(`Alert ${alertId} not found`);
    }

    const previousIncidentId = alert.incidentId?.toString();
    alert.incidentId = null as any;
    alert.status = AlertStatus.UNASSIGNED;
    await alert.save();

    if (previousIncidentId) {
      await this.redisService.invalidateIncident(previousIncidentId);
    }

    return alert;
  }

  /**
   * Find alerts with pagination and filtering
   */
  async findAll(query: QueryAlertsDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};

    if (query.service) {
      filter.service = query.service;
    }
    if (query.severity) {
      filter.severity = query.severity;
    }
    if (query.status) {
      filter.status = query.status;
    }
    if (query.unassigned === true || query.unassigned === 'true') {
      filter.$or = [{ incidentId: null }, { status: AlertStatus.UNASSIGNED }];
    }
    if (query.search) {
      filter.$or = [
        { title: { $regex: query.search, $options: 'i' } },
        { description: { $regex: query.search, $options: 'i' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.alertModel
        .find(filter)
        .populate('incidentId', 'title severity status service')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.alertModel.countDocuments(filter).exec(),
    ]);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findByIncident(incidentId: string): Promise<AlertDocument[]> {
    return this.alertModel
      .find({ incidentId: new Types.ObjectId(incidentId) })
      .sort({ timestamp: -1 })
      .exec();
  }

  async findById(id: string): Promise<AlertDocument | null> {
    const alert = await this.alertModel
      .findById(id)
      .populate('incidentId', 'title severity status service')
      .exec();
    if (!alert) {
      throw new NotFoundException(`Alert ${id} not found`);
    }
    return alert;
  }
}
