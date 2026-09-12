export type CorrelationStrategy = 'RESOURCE' | 'SERVICE';

export interface CorrelationKeyInput {
  service: string;
  title?: string;
  description?: string;
  resource?: string;
  rawPayload?: Record<string, any>;
}

export interface CorrelationKeyResult {
  key: string;
  resource: string | null;
  strategy: CorrelationStrategy;
}

const SHARED_RESOURCE_CATALOG: Array<{ id: string; patterns: RegExp[] }> = [
  { id: 's3', patterns: [/\bs3\b/i, /\bamazon\s*s3\b/i, /\bs3:\/\//i, /\bputobject\b/i, /\bgetobject\b/i] },
  { id: 'dynamodb', patterns: [/\bdynamodb\b/i, /\bdynamo\s*db\b/i] },
  { id: 'rds', patterns: [/\brds\b/i, /\bamazon\s*rds\b/i] },
  { id: 'postgres', patterns: [/\bpostgres(ql)?\b/i] },
  { id: 'redis', patterns: [/\bredis\b/i] },
  { id: 'kafka', patterns: [/\bkafka\b/i] },
  { id: 'elasticsearch', patterns: [/\belasticsearch\b/i, /\bopensearch\b/i] },
  { id: 'sqs', patterns: [/\bsqs\b/i, /\bamazon\s*sqs\b/i] },
  { id: 'cloudfront', patterns: [/\bcloudfront\b/i] },
  { id: 'mongodb', patterns: [/\bmongodb\b/i, /\bmongo\s*db\b/i] },
];

function slugifyResource(value: string): string | null {
  const slug = (value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || null;
}

function normalizeResourceToken(value: string): string | null {
  const token = (value || '').toLowerCase().trim();
  if (!token) {
    return null;
  }

  for (const entry of SHARED_RESOURCE_CATALOG) {
    if (entry.id === token) {
      return entry.id;
    }
    for (const pattern of entry.patterns) {
      if (pattern.test(token)) {
        return entry.id;
      }
    }
  }

  return null;
}

function extractResourceFromText(text: string): string | null {
  const haystack = (text || '').trim();
  if (!haystack) {
    return null;
  }

  for (const entry of SHARED_RESOURCE_CATALOG) {
    for (const pattern of entry.patterns) {
      if (pattern.test(haystack)) {
        return entry.id;
      }
    }
  }

  return null;
}

function resolveExplicitCandidate(candidate: unknown): string | null {
  if (typeof candidate !== 'string') {
    return null;
  }

  const normalized = normalizeResourceToken(candidate);
  if (normalized) {
    return normalized;
  }

  return slugifyResource(candidate);
}

function readExplicitResource(input: CorrelationKeyInput): string | null {
  const payload = input.rawPayload || {};
  const candidates = [
    input.resource,
    payload.resource,
    payload.dependency,
    payload.labels?.resource,
    payload.labels?.dependency,
  ];

  for (const candidate of candidates) {
    const resolved = resolveExplicitCandidate(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

export function resolveCorrelationKey(input: CorrelationKeyInput): CorrelationKeyResult {
  const service = (input.service || '').trim();
  const explicitResource = readExplicitResource(input);
  if (explicitResource) {
    return {
      key: `resource:${explicitResource}`,
      resource: explicitResource,
      strategy: 'RESOURCE',
    };
  }

  const combinedText = [input.title, input.description, JSON.stringify(input.rawPayload || {})]
    .filter(Boolean)
    .join(' ');
  const extractedResource = extractResourceFromText(combinedText);
  if (extractedResource) {
    return {
      key: `resource:${extractedResource}`,
      resource: extractedResource,
      strategy: 'RESOURCE',
    };
  }

  const normalizedService = service.toLowerCase();
  return {
    key: `service:${normalizedService}`,
    resource: null,
    strategy: 'SERVICE',
  };
}

export function buildResourceClusterTitle(resource: string, services: string[]): string {
  const uniqueServices = Array.from(new Set(services.filter(Boolean)));
  const serviceList = uniqueServices.join(', ');
  return `[Incident] Shared dependency ${resource} impacting ${serviceList}`;
}
