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

  @Prop({ required: true, default: '' })
  description: string;

  @Prop({ required: true, trim: true })
  severity: string;

  @Prop({ required: true, trim: true, index: true })
  service: string;

  @Prop({ required: true, default: () => new Date(), index: true })
  timestamp: Date;

  @Prop({ required: true, default: 'Prometheus' })
  source: string;

  @Prop({ type: Object, default: {} })
  rawPayload: Record<string, any>;

  @Prop({ type: Types.ObjectId, ref: 'Incident', default: null, index: true })
  incidentId?: Types.ObjectId;

  @Prop({
    required: true,
    enum: AlertStatus,
    default: AlertStatus.UNASSIGNED,
    index: true,
  })
  status: AlertStatus;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AlertSchema = SchemaFactory.createForClass(Alert);

AlertSchema.index({ service: 1, timestamp: -1 });
AlertSchema.index({ incidentId: 1 });
AlertSchema.index({ status: 1 });

