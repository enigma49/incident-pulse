import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type IncidentDocument = Incident & Document;

export enum IncidentStatus {
  OPEN = 'OPEN',
  INVESTIGATING = 'INVESTIGATING',
  MITIGATED = 'MITIGATED',
  RESOLVED = 'RESOLVED',
}

export enum IncidentSeverity {
  P1 = 'P1',
  P2 = 'P2',
  P3 = 'P3',
  P4 = 'P4',
}

@Schema({ timestamps: true })
export class Incident {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, default: '' })
  description: string;

  @Prop({
    required: true,
    enum: IncidentStatus,
    default: IncidentStatus.OPEN,
    index: true,
  })
  status: IncidentStatus;

  @Prop({
    required: true,
    enum: IncidentSeverity,
    default: IncidentSeverity.P3,
    index: true,
  })
  severity: IncidentSeverity;

  @Prop({ required: true, trim: true, index: true })
  service: string;

  @Prop({ type: Types.ObjectId, ref: 'Team', default: null, index: true })
  teamId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null, index: true })
  assigneeId?: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: Date, default: null })
  resolvedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const IncidentSchema = SchemaFactory.createForClass(Incident);

// Strategic Indexes for Search, Filtering, Sorting, and Pagination
IncidentSchema.index({ status: 1, severity: 1 });
IncidentSchema.index({ service: 1, createdAt: -1 });
IncidentSchema.index({ teamId: 1, status: 1 });
IncidentSchema.index({ assigneeId: 1, status: 1 });
IncidentSchema.index({ createdAt: -1 });
IncidentSchema.index({ updatedAt: -1 });
IncidentSchema.index({ title: 'text', description: 'text' });

