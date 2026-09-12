/**
 * Normalize a list of service names: trim, drop empties, dedupe (order preserved).
 */
export function normalizeServices(input: string[] | undefined | null): string[] {
  if (!input || input.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of input) {
    const value = (raw || '').trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }

  return result;
}

/**
 * Merge additional service names into an existing list without duplicates.
 */
export function mergeServices(
  existing: string[] | undefined | null,
  ...additions: Array<string | null | undefined>
): string[] {
  return normalizeServices([...(existing || []), ...additions.filter(Boolean) as string[]]);
}

/**
 * Primary service used for correlation keys (first entry after normalize).
 */
export function primaryService(services: string[]): string {
  const normalized = normalizeServices(services);
  return normalized[0] || '';
}

/**
 * Build correlation key from the primary service in a multi-service incident.
 */
export function correlationKeyForServices(services: string[]): string {
  const primary = primaryService(services);
  return primary ? `service:${primary.toLowerCase()}` : 'service:unknown';
}
