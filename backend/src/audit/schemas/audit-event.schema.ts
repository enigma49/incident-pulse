import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AuditEventDocument = AuditEvent & Document;

export enum ActorType {
  USER = 'USER',
  AI = 'AI',
  SYSTEM = 'SYSTEM',
}

@Schema({ timestamps: { createdAt: 'timestamp', updatedAt: false } })
export class AuditEvent {
  @Prop({ type: Types.ObjectId, ref: 'Incident', default: null, index: true })
  incidentId?: Types.ObjectId;

  @Prop({
    required: true,
    enum: ActorType,
    default: ActorType.SYSTEM,
  })
  actorType: ActorType;

  @Prop({ type: String, default: 'system' })
  actorId: string;

  @Prop({ required: true })
  action: string;

  @Prop({ required: true })
  entity: string;

  @Prop({ type: String, default: null })
  entityId?: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;

  timestamp?: Date;
}

export const AuditEventSchema = SchemaFactory.createForClass(AuditEvent);

AuditEventSchema.index({ incidentId: 1, timestamp: -1 });
AuditEventSchema.index({ action: 1, timestamp: -1 });
AuditEventSchema.index({ entityId: 1 });

