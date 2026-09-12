import { MockAIProvider } from './mock-ai.provider';
import { GroundedContext } from '../tools/context-gatherer.service';

describe('MockAIProvider', () => {
  let provider: MockAIProvider;

  beforeEach(() => {
    provider = new MockAIProvider();
  });

  it('should generate structured investigation grounded in context', async () => {
    const mockContext: GroundedContext = {
      incident: {
        id: 'inc-test-123',
        title: 'Payment Gateway Timeout',
        description: '504 responses spiking on payment endpoint',
        severity: 'P1',
        status: 'INVESTIGATING',
        services: ['payment-service'],
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 'inc-test-123:1700000000',
      },
      assignee: null,
      team: null,
      alerts: [
        {
          id: 'alt-test-999',
          title: 'High Latency on Payment Gateway',
          severity: 'P1',
          service: 'payment-service',
          source: 'Prometheus',
          timestamp: new Date(),
          count: 3,
          description: 'p99 latency > 3000ms',
        },
      ],
      recentActivity: [],
      tasks: [],
      similarIncidents: [],
      validEntityIds: new Set(['inc-test-123', 'alt-test-999']),
    };

    const response = await provider.investigate(mockContext);

    expect(response).toBeDefined();
    expect(response.metadata.provider).toBe('mock');
    expect(response.result.summary).toContain('payment-service');
    expect(response.result.hypotheses.length).toBeGreaterThanOrEqual(1);
    expect(response.result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'alt-test-999', type: 'alert' }),
      ]),
    );
    expect(response.result.confidence).toBeGreaterThan(0);
    expect(response.result.recommendations.length).toBeGreaterThan(0);
  });
});

