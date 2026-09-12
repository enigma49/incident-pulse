import { Types } from 'mongoose';

export const INCIDENT_ID_PREFIX = 'INC-';
export const INCIDENT_NUMBER_PADDING = 5;

export function formatIncidentDisplayId(incidentNumber: number): string {
  return `${INCIDENT_ID_PREFIX}${String(incidentNumber).padStart(INCIDENT_NUMBER_PADDING, '0')}`;
}

export function parseIncidentDisplayId(ref: string): number | null {
  const trimmed = ref.trim().toUpperCase();
  const match = trimmed.match(/^INC-(\d+)$/);
  if (!match) {
    return null;
  }

  const incidentNumber = Number.parseInt(match[1], 10);
  if (!Number.isFinite(incidentNumber) || incidentNumber <= 0) {
    return null;
  }

  return incidentNumber;
}

export function isObjectIdRef(ref: string): boolean {
  if (!Types.ObjectId.isValid(ref)) {
    return false;
  }

  return new Types.ObjectId(ref).toString() === ref;
}
