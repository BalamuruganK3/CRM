const jsonHeaders = { 'Content-Type': 'application/json' };

export async function request(path, options = {}) {
  const headers = { ...(options.body instanceof FormData ? {} : jsonHeaders), ...options.headers };
  const response = await fetch(path, { credentials: 'include', ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.code || 'SERVER');
    error.code = data.code || 'SERVER';
    error.status = response.status;
    throw error;
  }
  return data;
}

export const api = {
  me: () => request('/api/auth/me'),
  login: (username, password) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/api/auth/logout', { method: 'POST', body: '{}' }),
  ui: (page) => request(`/api/ui/${page}`),
  createUi: (body) => request('/api/ui', { method: 'POST', body: JSON.stringify(body) }),
  patchUi: (id, body) => request(`/api/ui/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteUi: (id) => request(`/api/ui/${id}`, { method: 'DELETE' }),
  reorderUi: (body) => request('/api/ui/reorder', { method: 'POST', body: JSON.stringify(body) }),
  users: () => request('/api/users'),
  createUser: (body) => request('/api/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (id, body) => request(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteUser: (id) => request(`/api/users/${id}`, { method: 'DELETE' }),
  projects: () => request('/api/projects'),
  project: (id) => request(`/api/projects/${id}`),
  createProject: (body) => request('/api/projects', { method: 'POST', body: JSON.stringify(body) }),
  addMember: (projectId, userId) => request(`/api/projects/${projectId}/members`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
  completeProject: (id) => request(`/api/projects/${id}/complete`, { method: 'POST', body: '{}' }),
  deleteProject: (id) => request(`/api/projects/${id}`, { method: 'DELETE' }),
  addModule: (projectId, title) => request(`/api/projects/${projectId}/modules`, { method: 'POST', body: JSON.stringify({ title }) }),
  deleteModule: (id) => request(`/api/modules/${id}`, { method: 'DELETE' }),
  addUpdate: (moduleId, form) => request(`/api/modules/${moduleId}/updates`, { method: 'POST', body: form }),
  deleteUpdate: (id) => request(`/api/updates/${id}`, { method: 'DELETE' }),
  purgeDemo: () => request('/api/demo', { method: 'DELETE' }),
};
