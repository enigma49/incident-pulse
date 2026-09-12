import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIProvider } from './ai-provider.interface';
import { OpenRouterProvider } from './openrouter.provider';
import { MockAIProvider } from './mock-ai.provider';

@Injectable()
export class AIProviderFactory {
  constructor(
    private configService: ConfigService,
    private openRouterProvider: OpenRouterProvider,
    private mockAIProvider: MockAIProvider,
  ) {}

  getProvider(): AIProvider {
    const configuredProvider = (
      this.configService.get<string>('AI_PROVIDER') || 'mock'
    ).toLowerCase();

    if (configuredProvider === 'openrouter') {
      return this.openRouterProvider;
    }

    return this.mockAIProvider;
  }
}

