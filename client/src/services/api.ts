import { API_BASE } from '../config/api';
import { Sentry } from '../config/sentry';
import { disconnectSocket, connectSocket } from './socketService';

const CSRF_COOKIE = 'maple_csrf';
const CSRF_HEADER = 'X-CSRF-Token';

function isMutatingMethod(method?: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes((method || 'GET').toUpperCase());
}

export function getCsrfToken(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

let refreshInFlight: Promise<boolean> | null = null;

export async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then((res) => {
        if (res.ok) {
          connectSocket();
        }
        return res.ok;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function secureFetch(url: string, options: RequestInit = {}, retried = false): Promise<Response> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});

  if (isMutatingMethod(method)) {
    const csrf = getCsrfToken();
    if (csrf) {
      headers.set(CSRF_HEADER, csrf);
    }
  }

  try {
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers,
    });

    const isAuthEndpoint =
      url.includes('/api/auth/login') ||
      url.includes('/api/auth/refresh') ||
      url.includes('/api/auth/logout');

    if (response.status === 401 && !retried && !isAuthEndpoint) {
      const refreshed = await refreshSession();
      if (refreshed) {
        return secureFetch(url, options, true);
      }
      if (!url.includes('/api/auth/me')) {
        window.location.href = '/';
      }
    }

    return response;
  } catch (error) {
    const isNetworkError =
      error instanceof TypeError &&
      (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'));
    if (!isNetworkError || !import.meta.env.DEV) {
      Sentry.captureException(error, { extra: { url, method } });
    }
    if (isNetworkError) {
      throw new Error('לא ניתן להתחבר לשרver — ודאי שהשרver רץ על פורט 5000');
    }
    throw error;
  }
}

export const apiFetch = async (url: string, options: RequestInit = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await secureFetch(url, { ...options, headers });

  if (response.status >= 500) {
    Sentry.captureMessage(`API error ${response.status}: ${url}`, 'error');
  }

  return response;
};

export async function logoutManager(): Promise<void> {
  disconnectSocket();
  await secureFetch(`${API_BASE}/api/auth/logout`, { method: 'POST' });
}

export async function checkAuthSession(): Promise<boolean> {
  try {
    let response = await secureFetch(`${API_BASE}/api/auth/me`);
    if (response.status === 401) {
      const refreshed = await refreshSession();
      if (refreshed) {
        response = await secureFetch(`${API_BASE}/api/auth/me`);
      }
    }
    return response.ok;
  } catch {
    return false;
  }
}
