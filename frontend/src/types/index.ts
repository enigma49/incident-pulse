export type UserRole = 'ADMIN' | 'OPERATOR';

export interface User {
  id: string;
  _id?: string;
  name: string;
  email: string;
  role: UserRole;
  teamId?: any;
  isActive?: boolean;
  assignedIncidents?: number;
  criticalIncidents?: number;
}

export interface Team {
  _id: string;
  name: string;
  description: string;
  serviceResponsibility: string[];
  leadUserId?: User | string | null;
  isArchived?: boolean;
  activeIncidents?: number;
  criticalIncidents?: number;
  memberCount?: number;
}

export interface TeamDetails extends Team {
  members?: User[];
}

export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'MITIGATED' | 'RESOLVED';
export type IncidentSeverity = 'P1' | 'P2' | 'P3' | 'P4';

export interface Incident {
  _id: string;
  incidentNumber: number;
  title: string;
  description: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  services: string[];
  correlationKey?: string;
  relatedIncidentIds?: string[];
  relatedIncidents?: Incident[];
  mergedIntoId?: string | Incident | null;
  teamId?: Team | null;
  assigneeId?: User | null;
  tags: string[];
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Alert {
  _id: string;
  title: string;
  description: string;
  severity: string;
  service: string;
  resource?: string;
  correlationKey?: string;
  timestamp: string;
  source: string;
  rawPayload: Record<string, any>;
  incidentId?: any;
  status: 'UNASSIGNED' | 'CORRELATED' | 'RESOLVED';
  fingerprint?: string;
  count?: number;
  lastSeenAt?: string;
}

export interface Comment {
  _id: string;
  incidentId: string;
  userId: User;
  content: string;
  createdAt: string;
}

export interface Task {
  _id: string;
  incidentId: string;
  title: string;
  description?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  assigneeId?: User | null;
  createdAt: string;
}

export interface AuditEvent {
  _id: string;
  incidentId?: string;
  actorType: 'USER' | 'AI' | 'SYSTEM';
  actorId: string;
  action: string;
  entity: string;
  entityId?: string;
  metadata: Record<string, any>;
  timestamp: string;
}

export interface AIInvestigation {
  _id: string;
  incidentId: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  summary: string;
  hypotheses?: Array<{
    title: string;
    explanation: string;
    confidence: number;
  }>;
  evidence?: Array<{
    type: string;
    id: string;
    reason: string;
  }> | string[];
  confidence: number;
  recommendations?: Array<{
    title: string;
    explanation: string;
  }> | string[];
  proposedAction?: {
    type: string;
    description?: string;
    parameters: Record<string, any>;
    reason: string;
    status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXECUTED';
    reviewedAt?: string;
    reviewedBy?: string;
    rejectionReason?: string;
    executionResult?: Record<string, any>;
    executionError?: string;
  } | null;
  provider?: string;
  aiModel?: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs?: number;
  progressEvents?: string[];
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

