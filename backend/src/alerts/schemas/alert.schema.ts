import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AlertDocument = Alert & Document;

export enum AlertStatus {
  UNASSIGNED = 'UNASSIGNED',
  CORRELATED = 'CORRELATED',
  RESOLVED = 'RESOLVED',
}

@Schema({ timestamps: true })
export class Alert {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: false, default: '' })
  description: string;

  @Prop({ required: true, trim: true })
  severity: string;

  @Prop({ required: true, trim: true })
  service: string;

  @Prop({ default: null, trim: true })
  resource?: string;

  @Prop({ default: null, trim: true })
  correlationKey?: string;

  @Prop({ required: true, default: () => new Date() })
  timestamp: Date;

  @Prop({ required: true, default: 'Prometheus' })
  source: string;

  @Prop({ type: Object, default: {} })
  rawPayload: Record<string, any>;

  @Prop({ type: Types.ObjectId, ref: 'Incident', default: null })
  incidentId?: Types.ObjectId;

  @Prop({
    required: true,
    enum: AlertStatus,
    default: AlertStatus.UNASSIGNED,
  })
  status: AlertStatus;

  @Prop({ default: null })
  fingerprint?: string;

  @Prop({ default: 1 })
  count: number;

  @Prop({ default: () => new Date() })
  lastSeenAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AlertSchema = SchemaFactory.createForClass(Alert);

AlertSchema.index({ service: 1, timestamp: -1 });
AlertSchema.index({ incidentId: 1 });
AlertSchema.index({ status: 1 });
AlertSchema.index({ fingerprint: 1, timestamp: -1 });
AlertSchema.index({ correlationKey: 1 });

