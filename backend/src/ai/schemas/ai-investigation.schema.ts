import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AIInvestigationDocument = AIInvestigation & Document;

export enum AIInvestigationStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum ProposedActionStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXECUTED = 'EXECUTED',
}

@Schema({ _id: false })
export class ProposedAction {
  @Prop({ required: true })
  type: string; // e.g. 'CHANGE_SEVERITY', 'ASSIGN_INCIDENT', 'CREATE_TASK', 'CHANGE_STATUS'

  @Prop({ type: Object, required: true })
  parameters: Record<string, any>;

  @Prop({ required: true })
  reason: string;

  @Prop({
    type: String,
    enum: ProposedActionStatus,
    default: ProposedActionStatus.PENDING_APPROVAL,
  })
  status: ProposedActionStatus;

  @Prop({ type: Date, default: null })
  reviewedAt?: Date;

  @Prop({ type: String, default: null })
  reviewedBy?: string;
}

@Schema({ timestamps: true })
export class AIInvestigation {
  @Prop({ type: Types.ObjectId, ref: 'Incident', required: true, index: true })
  incidentId: Types.ObjectId;

  @Prop({
    required: true,
    enum: AIInvestigationStatus,
    default: AIInvestigationStatus.QUEUED,
    index: true,
  })
  status: AIInvestigationStatus;

  @Prop({ default: '' })
  summary: string;

  @Prop({ type: [String], default: [] })
  findings: string[];

  @Prop({ type: [String], default: [] })
  evidence: string[];

  @Prop({ type: Number, default: 0 })
  confidence: number;

  @Prop({ type: [String], default: [] })
  recommendations: string[];

  @Prop({ type: ProposedAction, default: null })
  proposedAction?: ProposedAction;

  @Prop({ default: '' })
  rawOutput: string;

  @Prop({ default: 0 })
  roundCount: number;

  @Prop({ default: null })
  error?: string;

  @Prop({ type: Date, default: null })
  startedAt?: Date;

  @Prop({ type: Date, default: null })
  completedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AIInvestigationSchema = SchemaFactory.createForClass(AIInvestigation);

AIInvestigationSchema.index({ incidentId: 1, createdAt: -1 });
AIInvestigationSchema.index({ status: 1 });

