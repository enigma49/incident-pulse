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
    list: () => request<any[]>('/teams'),
    workload: () => request<any[]>('/teams/workload'),
  },

  users: {
    list: () => request<any[]>('/users'),
    workload: () => request<any[]>('/users/workload'),
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
  },

  health: () => request<any>('/health'),
};

