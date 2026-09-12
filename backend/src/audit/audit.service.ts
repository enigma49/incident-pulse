import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditEvent, AuditEventDocument, ActorType } from './schemas/audit-event.schema';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(AuditEvent.name)
    private auditModel: Model<AuditEventDocument>,
  ) {}

  async logEvent(params: {
    incidentId?: string | Types.ObjectId;
    actorType: ActorType;
    actorId?: string;
    action: string;
    entity: string;
    entityId?: string;
    metadata?: Record<string, any>;
  }): Promise<AuditEventDocument> {
    try {
      const event = new this.auditModel({
        incidentId: params.incidentId ? new Types.ObjectId(params.incidentId.toString()) : null,
        actorType: params.actorType,
        actorId: params.actorId || 'system',
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        metadata: params.metadata || {},
        timestamp: new Date(),
      });

      this.logger.log(`Audit: [${params.action}] on ${params.entity}:${params.entityId || 'N/A'} by ${params.actorType}:${params.actorId || 'system'}`);
      return await event.save();
    } catch (err: any) {
      this.logger.error(`Failed to record audit event: ${err.message}`, err.stack);
      throw err;
    }
  }

  async findByIncidentId(incidentId: string): Promise<AuditEventDocument[]> {
    return this.auditModel
      .find({ incidentId: new Types.ObjectId(incidentId) })
      .sort({ timestamp: -1 })
      .limit(100)
      .exec();
  }

  async findRecent(limit = 20): Promise<AuditEventDocument[]> {
    return this.auditModel
      .find()
      .sort({ timestamp: -1 })
      .limit(limit)
      .populate('incidentId', 'title severity status incidentNumber')
      .exec();
  }
}

