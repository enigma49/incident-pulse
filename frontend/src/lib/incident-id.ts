export const INCIDENT_ID_PREFIX = "INC-";
export const INCIDENT_NUMBER_PADDING = 5;

export function formatIncidentId(incidentNumber: number): string {
  return `${INCIDENT_ID_PREFIX}${String(incidentNumber).padStart(INCIDENT_NUMBER_PADDING, "0")}`;
}

export function getIncidentRouteId(incident: {
  _id: string;
  incidentNumber?: number;
}): string {
  if (incident.incidentNumber != null) {
    return formatIncidentId(incident.incidentNumber);
  }

  return incident._id;
}

export function getIncidentLinkTarget(
  incident: string | { _id: string; incidentNumber?: number } | null | undefined,
): string {
  if (!incident) {
    return "";
  }

  if (typeof incident === "string") {
    return incident;
  }

  return getIncidentRouteId(incident);
}
