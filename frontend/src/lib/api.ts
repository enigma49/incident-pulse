const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(message);
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errorData: any = {};
    try {
      errorData = await res.json();
    } catch {
      // not json
    }
    const message = errorData.message || `Request failed with status ${res.status}`;
    throw new ApiError(res.status, Array.isArray(message) ? message.join(', ') : message, errorData);
  }

  if (res.status === 204) {
    return {} as T;
  }

  return res.json();
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{ accessToken: string; refreshToken: string; user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    me: () => request<any>('/auth/me'),
  },

  incidents: {
    list: (params: Record<string, any> = {}) => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          searchParams.append(k, String(v));
        }
      });
      const query = searchParams.toString();
      return request<any>(`/incidents${query ? `?${query}` : ''}`);
    },
    get: (id: string) => request<any>(`/incidents/${id}`),
    create: (data: any) =>
      request<any>('/incidents', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      request<any>(`/incidents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    changeStatus: (id: string, status: string) =>
      request<any>(`/incidents/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    changeSeverity: (id: string, severity: string) =>
      request<any>(`/incidents/${id}/severity`, {
        method: 'PATCH',
        body: JSON.stringify({ severity }),
      }),
    assign: (id: string, data: { assigneeId?: string; teamId?: string }) =>
      request<any>(`/incidents/${id}/assign`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    resolve: (id: string) =>
      request<any>(`/incidents/${id}/resolve`, {
        method: 'POST',
      }),
    relate: (id: string, incidentId: string) =>
      request<any>(`/incidents/${id}/relate`, {
        method: 'POST',
        body: JSON.stringify({ incidentId }),
      }),
    unrelate: (id: string, relatedId: string) =>
      request<void>(`/incidents/${id}/relate/${relatedId}`, {
        method: 'DELETE',
      }),
    merge: (id: string, targetIncidentId: string) =>
      request<any>(`/incidents/${id}/merge`, {
        method: 'POST',
        body: JSON.stringify({ targetIncidentId }),
      }),
  },

  comments: {
    create: (incidentId: string, content: string) =>
      request<any>(`/incidents/${incidentId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      }),
    list: (incidentId: string) => request<any[]>(`/incidents/${incidentId}/comments`),
  },

  tasks: {
    create: (incidentId: string, data: { title: string; description?: string; assigneeId?: string }) =>
      request<any>(`/incidents/${incidentId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (taskId: string, data: any) =>
      request<any>(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (taskId: string) =>
      request<void>(`/tasks/${taskId}`, {
        method: 'DELETE',
      }),
  },

  teams: {
    list: (includeArchived = false) =>
      request<any[]>(`/teams${includeArchived ? '?includeArchived=true' : ''}`),
    workload: (includeArchived = false) =>
      request<any[]>(`/teams/workload${includeArchived ? '?includeArchived=true' : ''}`),
    get: (id: string) => request<any>(`/teams/${id}`),
    create: (data: {
      name: string;
      description?: string;
      serviceResponsibility?: string[];
      leadUserId?: string;
    }) =>
      request<any>('/teams', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: {
      name?: string;
      description?: string;
      serviceResponsibility?: string[];
      leadUserId?: string | null;
      isArchived?: boolean;
    }) =>
      request<any>(`/teams/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    members: (id: string) => request<any[]>(`/teams/${id}/members`),
    updateMembers: (id: string, data: { addUserIds?: string[]; removeUserIds?: string[] }) =>
      request<any[]>(`/teams/${id}/members`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },

  users: {
    list: (includeInactive = false) =>
      request<any[]>(`/users${includeInactive ? '?includeInactive=true' : ''}`),
    workload: (includeInactive = false) =>
      request<any[]>(`/users/workload${includeInactive ? '?includeInactive=true' : ''}`),
    create: (data: {
      name: string;
      email: string;
      password: string;
      role?: 'ADMIN' | 'OPERATOR';
      teamId?: string;
    }) =>
      request<any>('/users', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: {
      name?: string;
      role?: 'ADMIN' | 'OPERATOR';
      teamId?: string | null;
      isActive?: boolean;
    }) =>
      request<any>(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    resetPassword: (id: string, password: string) =>
      request<void>(`/users/${id}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ password }),
      }),
  },

  alerts: {
    list: (params: Record<string, any> = {}) => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          searchParams.append(k, String(v));
        }
      });
      const query = searchParams.toString();
      return request<any>(`/alerts${query ? `?${query}` : ''}`);
    },
    getByIncident: (incidentId: string) => request<any[]>(`/alerts/incident/${incidentId}`),
    get: (id: string) => request<any>(`/alerts/${id}`),
    create: (data: any) =>
      request<any>('/alerts', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    associate: (alertId: string, incidentId: string) =>
      request<any>(`/alerts/${alertId}/associate`, {
        method: 'PATCH',
        body: JSON.stringify({ incidentId }),
      }),
    unassociate: (alertId: string) =>
      request<any>(`/alerts/${alertId}/unassociate`, {
        method: 'PATCH',
      }),
  },

  dashboard: {
    overview: () => request<any>('/dashboard/overview'),
  },

  ai: {
    investigate: (incidentId: string) =>
      request<any>(`/incidents/${incidentId}/investigate`, {
        method: 'POST',
      }),
    getLatest: (incidentId: string) =>
      request<any>(`/incidents/${incidentId}/investigation`),
    getHistory: (incidentId: string) =>
      request<any[]>(`/incidents/${incidentId}/investigations`),
    approveAction: (incidentId: string, investigationId?: string, force?: boolean) =>
      request<any>(
        investigationId
          ? `/incidents/${incidentId}/investigations/${investigationId}/actions/approve`
          : `/incidents/${incidentId}/investigation/actions/approve`,
        {
          method: 'POST',
          body: JSON.stringify({ force }),
        },
      ),
    rejectAction: (incidentId: string, investigationId?: string, reason?: string) =>
      request<any>(
        investigationId
          ? `/incidents/${incidentId}/investigations/${investigationId}/actions/reject`
          : `/incidents/${incidentId}/investigation/actions/reject`,
        {
          method: 'POST',
          body: JSON.stringify({ reason }),
        },
      ),
  },

  health: () => request<any>('/health'),
};

