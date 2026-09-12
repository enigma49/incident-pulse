import { AIOutputZodSchema } from './ai-output.zod';

describe('AIOutputZodSchema', () => {
  it('should validate a correct structured AI investigation output', () => {
    const validData = {
      summary: 'High CPU utilization detected on payment-service due to thread contention.',
      hypotheses: [
        {
          title: 'Database connection pool saturation',
          explanation: 'Connection pool metrics show max connections reached.',
          confidence: 85,
        },
      ],
      evidence: [
        {
          type: 'alert',
          id: 'alt-12345',
          reason: 'Alert triggered when latency exceeded 5000ms threshold.',
        },
      ],
      confidence: 85,
      recommendations: [
        {
          title: 'Increase pool size to 50',
          explanation: 'Allows database adapter to absorb traffic spikes.',
        },
      ],
      proposedAction: {
        type: 'CREATE_TASK',
        description: 'Increase pool size and monitor latency',
        parameters: { taskTitle: 'Increase pool size' },
      },
    };

    const parsed = AIOutputZodSchema.parse(validData);
    expect(parsed.summary).toBe(validData.summary);
    expect(parsed.hypotheses).toHaveLength(1);
    expect(parsed.proposedAction?.type).toBe('CREATE_TASK');
  });

  it('should accept null proposedAction as a valid no-action result', () => {
    const noActionData = {
      summary: 'Telemetry shows transient network blip. Self-resolved.',
      hypotheses: [
        {
          title: 'Transient network packet drop',
          explanation: 'Metrics recovered within 60 seconds.',
          confidence: 90,
        },
      ],
      evidence: [],
      confidence: 90,
      recommendations: [
        {
          title: 'Continue passive monitoring',
          explanation: 'No immediate automated remediation recommended.',
        },
      ],
      proposedAction: null,
    };

    const parsed = AIOutputZodSchema.parse(noActionData);
    expect(parsed.proposedAction).toBeNull();
  });

  it('should reject summary shorter than 10 characters', () => {
    const invalidData = {
      summary: 'Short',
      hypotheses: [{ title: 'T', explanation: 'E', confidence: 50 }],
      evidence: [],
      confidence: 50,
      recommendations: [{ title: 'R', explanation: 'E' }],
      proposedAction: null,
    };

    expect(() => AIOutputZodSchema.parse(invalidData)).toThrow();
  });

  it('should reject empty hypotheses array', () => {
    const invalidData = {
      summary: 'Valid summary with enough characters.',
      hypotheses: [],
      evidence: [],
      confidence: 50,
      recommendations: [{ title: 'R', explanation: 'E' }],
      proposedAction: null,
    };

    expect(() => AIOutputZodSchema.parse(invalidData)).toThrow();
  });

  it('should reject confidence out of 0-100 range', () => {
    const invalidData = {
      summary: 'Valid summary with enough characters.',
      hypotheses: [{ title: 'T', explanation: 'E', confidence: 150 }],
      evidence: [],
      confidence: 150,
      recommendations: [{ title: 'R', explanation: 'E' }],
      proposedAction: null,
    };

    expect(() => AIOutputZodSchema.parse(invalidData)).toThrow();
  });
});

