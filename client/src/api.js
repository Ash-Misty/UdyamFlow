const API_BASE = '/api';

export async function api(path, options = {}) {
  const token = localStorage.getItem('udyamflow-token');
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.body && !(options.body instanceof FormData) ? JSON.stringify(options.body) : options.body,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${response.status}).`);
  }
  if (response.headers.get('content-type')?.includes('application/pdf') ||
      response.headers.get('content-type')?.includes('text/csv')) return response.blob();
  return response.status === 204 ? null : response.json();
}

export async function download(path, filename) {
  const blob = await api(path);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
