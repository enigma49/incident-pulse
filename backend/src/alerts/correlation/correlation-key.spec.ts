import {
  buildResourceClusterTitle,
  resolveCorrelationKey,
} from './correlation-key';

describe('resolveCorrelationKey', () => {
  it('uses explicit resource from payload', () => {
    const result = resolveCorrelationKey({
      service: 'payment-service',
      title: 'Timeouts',
      resource: 's3',
    });

    expect(result).toEqual({
      key: 'resource:s3',
      resource: 's3',
      strategy: 'RESOURCE',
    });
  });

  it('lets explicit resource win over title tokens', () => {
    const result = resolveCorrelationKey({
      service: 'payment-service',
      title: 'DynamoDB throttling',
      resource: 's3',
    });

    expect(result).toEqual({
      key: 'resource:s3',
      resource: 's3',
      strategy: 'RESOURCE',
    });
  });

  it('normalizes Amazon S3, s3 URIs, and PutObject to s3', () => {
    expect(
      resolveCorrelationKey({ service: 'auth-service', title: 'Amazon S3 outage' }).key,
    ).toBe('resource:s3');
    expect(
      resolveCorrelationKey({
        service: 'auth-service',
        title: 'Failed write to s3://checkout-bucket',
      }).key,
    ).toBe('resource:s3');
    expect(
      resolveCorrelationKey({ service: 'auth-service', title: 'PutObject timeouts' }).key,
    ).toBe('resource:s3');
  });

  it('extracts s3 from title text', () => {
    const result = resolveCorrelationKey({
      service: 'auth-service',
      title: 'S3 GetObject 503 errors',
      description: 'Read path failing',
    });

    expect(result.key).toBe('resource:s3');
    expect(result.strategy).toBe('RESOURCE');
  });

  it('falls back to service when no shared resource is found', () => {
    const result = resolveCorrelationKey({
      service: 'auth-service',
      title: 'High CPU usage',
    });

    expect(result).toEqual({
      key: 'service:auth-service',
      resource: null,
      strategy: 'SERVICE',
    });
  });

  it('reads resource from prometheus-style labels', () => {
    const result = resolveCorrelationKey({
      service: 'order-service',
      title: 'Write failures',
      rawPayload: { labels: { resource: 'dynamodb' } },
    });

    expect(result.key).toBe('resource:dynamodb');
  });

  it('reads resource from rawPayload.resource', () => {
    const result = resolveCorrelationKey({
      service: 'order-service',
      title: 'Write failures',
      rawPayload: { resource: 'kafka' },
    });

    expect(result.key).toBe('resource:kafka');
  });

  it('keeps a custom explicit resource even when title mentions another dependency', () => {
    const result = resolveCorrelationKey({
      service: 'payment-service',
      title: 'Redis timeout',
      resource: 'checkout-queue',
    });

    expect(result).toEqual({
      key: 'resource:checkout-queue',
      resource: 'checkout-queue',
      strategy: 'RESOURCE',
    });
  });
});

describe('buildResourceClusterTitle', () => {
  it('lists impacted services in the title', () => {
    expect(
      buildResourceClusterTitle('s3', ['payment-service', 'auth-service', 'payment-service']),
    ).toBe('[Incident] Shared dependency s3 impacting payment-service, auth-service');
  });
});
