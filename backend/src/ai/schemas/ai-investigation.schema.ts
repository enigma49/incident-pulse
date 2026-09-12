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
export class Hypothesis {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  explanation: string;

  @Prop({ required: true, default: 0 })
  confidence: number;
}

@Schema({ _id: false })
export class EvidenceItem {
  @Prop({ required: true })
  type: string; // e.g. 'alert', 'incident', 'log', 'metric'

  @Prop({ required: true })
  id: string; // actual referenced entity id

  @Prop({ required: true })
  reason: string;
}

@Schema({ _id: false })
export class RecommendationItem {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  explanation: string;
}

@Schema({ _id: false })
export class ProposedAction {
  @Prop({ required: true })
  type: string; // e.g. 'CHANGE_SEVERITY', 'ASSIGN_INCIDENT', 'CREATE_TASK', 'CHANGE_STATUS'

  @Prop({ required: true, default: '' })
  description: string;

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

  @Prop({ type: String, default: null })
  rejectionReason?: string;

  @Prop({ type: Object, default: null })
  executionResult?: Record<string, any>;

  @Prop({ type: String, default: null })
  executionError?: string;
}

@Schema({ _id: false })
export class TokenUsage {
  @Prop({ default: 0 })
  promptTokens: number;

  @Prop({ default: 0 })
  completionTokens: number;

  @Prop({ default: 0 })
  totalTokens: number;
}

@Schema({ timestamps: true })
export class AIInvestigation {
  @Prop({ type: Types.ObjectId, ref: 'Incident', required: true, index: true })
  incidentId: Types.ObjectId;

  @Prop({ required: true, default: '' })
  incidentVersion: string;

  @Prop({
    required: true,
    enum: AIInvestigationStatus,
    default: AIInvestigationStatus.QUEUED,
  })
  status: AIInvestigationStatus;

  @Prop({ default: '' })
  summary: string;

  @Prop({ type: [Hypothesis], default: [] })
  hypotheses: Hypothesis[];

  @Prop({ type: [EvidenceItem], default: [] })
  evidence: EvidenceItem[];

  @Prop({ type: Number, default: 0 })
  confidence: number;

  @Prop({ type: [RecommendationItem], default: [] })
  recommendations: RecommendationItem[];

  @Prop({ type: ProposedAction, default: null })
  proposedAction?: ProposedAction | null;

  @Prop({ default: 'mock' })
  provider: string;

  @Prop({ default: 'mock-deterministic-v1' })
  aiModel: string;

  @Prop({ type: TokenUsage, default: () => ({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }) })
  tokenUsage: TokenUsage;

  @Prop({ default: 0 })
  latencyMs: number;

  @Prop({ type: [String], default: [] })
  progressEvents: string[];

  @Prop({ default: '' })
  rawOutput: string;

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
AIInvestigationSchema.index({ incidentId: 1, incidentVersion: 1 });
AIInvestigationSchema.index({ status: 1 });
