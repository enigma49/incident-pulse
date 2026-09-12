import { z } from 'zod';

export const HypothesisZodSchema = z.object({
  title: z.string().min(1, 'Hypothesis title is required'),
  explanation: z.string().min(1, 'Hypothesis explanation is required'),
  confidence: z.number().min(0).max(100),
});

export const EvidenceItemZodSchema = z.object({
  type: z.string().min(1, 'Evidence type is required'),
  id: z.string().min(1, 'Evidence ID reference is required'),
  reason: z.string().min(1, 'Evidence reason is required'),
});

export const RecommendationItemZodSchema = z.object({
  title: z.string().min(1, 'Recommendation title is required'),
  explanation: z.string().min(1, 'Recommendation explanation is required'),
});

export const ProposedActionZodSchema = z
  .object({
    type: z.string().min(1, 'Action type is required'),
    description: z.string().min(1, 'Action description is required'),
    parameters: z.record(z.any()).default({}),
    reason: z.string().optional(),
  })
  .nullable();

export const AIOutputZodSchema = z.object({
  summary: z.string().min(10, 'Summary must be at least 10 characters long'),
  hypotheses: z.array(HypothesisZodSchema).min(1, 'At least one hypothesis is required'),
  evidence: z.array(EvidenceItemZodSchema).default([]),
  confidence: z.number().min(0).max(100),
  recommendations: z.array(RecommendationItemZodSchema).min(1, 'At least one recommendation is required'),
  proposedAction: ProposedActionZodSchema.default(null),
});

export type AIOutputValidated = z.infer<typeof AIOutputZodSchema>;
export type HypothesisValidated = z.infer<typeof HypothesisZodSchema>;
export type EvidenceItemValidated = z.infer<typeof EvidenceItemZodSchema>;
export type RecommendationItemValidated = z.infer<typeof RecommendationItemZodSchema>;
export type ProposedActionValidated = z.infer<typeof ProposedActionZodSchema>;

