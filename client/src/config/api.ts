/** Empty VITE_API_URL = same origin (/api) — used when the server serves the built client. */
export const API_BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:5000' : '');
export const API_URL = API_BASE ? `${API_BASE.replace(/\/$/, '')}/api` : '/api';
