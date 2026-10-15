const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details || {}; // field -> message, from the backend validation
  }
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is the backend running?');
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON response; handled below
  }

  if (!res.ok) {
    throw new ApiError(res.status, body?.error || `Request failed (${res.status})`, body?.details);
  }
  return body;
}

const send = (method, path, data) =>
  request(path, { method, body: data === undefined ? undefined : JSON.stringify(data) });

export const api = {
  getStats: () => request('/stats'),
  listEvents: (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.search) query.set('search', params.search);
    const qs = query.toString();
    return request(`/events${qs ? `?${qs}` : ''}`);
  },
  getEvent: (id) => request(`/events/${id}`),
  createEvent: (data) => send('POST', '/events', data),
  updateEvent: (id, data) => send('PUT', `/events/${id}`, data),
  deleteEvent: (id) => send('DELETE', `/events/${id}`),
  listRegistrations: (id) => request(`/events/${id}/registrations`),
  register: (id, data) => send('POST', `/events/${id}/register`, data),
};
