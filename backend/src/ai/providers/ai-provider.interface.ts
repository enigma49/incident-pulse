import { GroundedContext } from '../tools/context-gatherer.service';
import { AIOutputValidated } from '../schemas/ai-output.zod';

export interface ProviderMetadata {
  provider: string;
  model: string;
  latencyMs: number;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIProviderResponse {
  result: AIOutputValidated;
  metadata: ProviderMetadata;
  rawOutput?: string;
}

export interface AIProvider {
  readonly name: string;
  investigate(context: GroundedContext): Promise<AIProviderResponse>;
}

