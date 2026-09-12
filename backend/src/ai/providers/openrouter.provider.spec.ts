import { ConfigService } from '@nestjs/config';
import { OpenRouterProvider } from './openrouter.provider';
import { MockAIProvider } from './mock-ai.provider';
import { GroundedContext } from '../tools/context-gatherer.service';

describe('OpenRouterProvider', () => {
  let provider: OpenRouterProvider;
  let mockFallback: MockAIProvider;
  let configService: jest.Mocked<ConfigService>;

  const sampleContext: GroundedContext = {
    incident: {
      id: 'inc-1',
      title: 'Outage',
      description: 'System down',
      severity: 'P1',
      status: 'OPEN',
      service: 'auth-service',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 'inc-1:100',
    },
    assignee: null,
    team: null,
    alerts: [],
    recentActivity: [],
    tasks: [],
    similarIncidents: [],
    validEntityIds: new Set(['inc-1']),
  };

  beforeEach(() => {
    mockFallback = new MockAIProvider();
    jest.spyOn(mockFallback, 'investigate');

    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'OPENROUTER_API_KEY') return '';
        if (key === 'OPENROUTER_BASE_URL') return 'https://openrouter.ai/api/v1';
        if (key === 'OPENROUTER_MODEL') return 'anthropic/claude-3.5-sonnet';
        return undefined;
      }),
    } as any;

    provider = new OpenRouterProvider(configService, mockFallback);
  });

  it('should fall back to MockAIProvider when API key is unconfigured', async () => {
    const result = await provider.investigate(sampleContext);
    expect(mockFallback.investigate).toHaveBeenCalledWith(sampleContext);
    expect(result.metadata.provider).toBe('mock');
  });

  it('should handle OpenRouter 429 rate limit and fall back gracefully', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'OPENROUTER_API_KEY') return 'test-key-123';
      return 'mock-val';
    });
    provider = new OpenRouterProvider(configService, mockFallback);

    // Mock global fetch to return 429
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: jest.fn().mockResolvedValue('Too Many Requests'),
    } as any);

    const result = await provider.investigate(sampleContext);
    expect(mockFallback.investigate).toHaveBeenCalled();
    expect(result.metadata.provider).toBe('mock');
  });

  it('should parse and return structured output on successful OpenRouter response', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'OPENROUTER_API_KEY') return 'valid-openrouter-key';
      return 'mock-val';
    });
    provider = new OpenRouterProvider(configService, mockFallback);

    const mockLLMJson = JSON.stringify({
      summary: 'Auth service latency spike due to token cache invalidation loop.',
      hypotheses: [
        {
          title: 'Cache Stampede on Token Validation',
          explanation: 'Token cache misses caused repeated DB lookups.',
          confidence: 90,
        },
      ],
      evidence: [
        {
          type: 'incident',
          id: 'inc-1',
          reason: 'Incident active during cache miss storm.',
        },
      ],
      confidence: 90,
      recommendations: [
        {
          title: 'Warm token cache',
          explanation: 'Preload active tokens.',
        },
      ],
      proposedAction: null,
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        choices: [{ message: { content: mockLLMJson } }],
        usage: { prompt_tokens: 300, completion_tokens: 150, total_tokens: 450 },
      }),
    } as any);

    const result = await provider.investigate(sampleContext);
    expect(result.metadata.provider).toBe('openrouter');
    expect(result.result.confidence).toBe(90);
    expect(result.result.hypotheses[0].title).toContain('Cache Stampede');
  });
});

