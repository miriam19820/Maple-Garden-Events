/**
 * Public site URL used in customer-facing links (feedback surveys, manager alerts).
 *
 * Deploy injects CLIENT_URL=https://__DOMAIN__. The live admin host is also
 * always accepted, so sending from https://admin.maple-g.co.il never falls
 * back to localhost. Extra hosts can be listed in PUBLIC_ORIGINS.
 *
 * A public request origin wins (the tab the operator is in). Cron / workers
 * have no request and use CLIENT_URL / DOMAIN / the built-in admin host.
 */

/** Always-valid operator dashboard. Same app, second hostname. */
export const BUILTIN_PUBLIC_ORIGINS = ['https://admin.maple-g.co.il'] as const;

export function isLocalBaseUrl(url?: string | null): boolean {
  const value = (url ?? '').toLowerCase();
  if (!value) return true;
  return value.includes('localhost') || value.includes('127.0.0.1') || value.includes('0.0.0.0');
}

export function normalizeBaseUrl(url?: string | null): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  const withProtocol = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/$/, '');
}

function addPublicOrigin(into: Set<string>, raw?: string | null): void {
  const origin = normalizeBaseUrl(raw);
  if (origin && !isLocalBaseUrl(origin)) into.add(origin);
}

export function getConfiguredPublicOrigins(): string[] {
  const origins = new Set<string>();
  addPublicOrigin(origins, process.env.CLIENT_URL);
  addPublicOrigin(origins, process.env.PUBLIC_URL);
  addPublicOrigin(origins, process.env.DOMAIN);
  for (const part of (process.env.PUBLIC_ORIGINS ?? '').split(',')) {
    addPublicOrigin(origins, part);
  }
  for (const extra of BUILTIN_PUBLIC_ORIGINS) {
    addPublicOrigin(origins, extra);
  }
  return [...origins];
}

export function originFromRequest(req: {
  protocol?: string;
  get(name: string): string | undefined;
}): string | undefined {
  const hostHeader = req.get('x-forwarded-host') || req.get('host');
  if (!hostHeader) return undefined;
  const host = hostHeader.split(',')[0]?.trim();
  if (!host) return undefined;
  const forwarded = req.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const hostIsLocal = isLocalBaseUrl(`http://${host}`);
  // Public hosts terminate TLS at nginx; if the proto header is missing, keep https.
  const proto = forwarded || (hostIsLocal ? (req.protocol || 'http') : 'https');
  return normalizeBaseUrl(`${proto}://${host}`);
}

/**
 * Prefer the URL the operator is actually using, then configured public env,
 * then the built-in admin host, then localhost only as a last-resort fallback.
 */
export function resolvePublicBaseUrl(requestOrigin?: string | null): string {
  const fromRequest = normalizeBaseUrl(requestOrigin);
  if (fromRequest && !isLocalBaseUrl(fromRequest)) return fromRequest;

  const fromClient = normalizeBaseUrl(process.env.CLIENT_URL);
  if (fromClient && !isLocalBaseUrl(fromClient)) return fromClient;

  const fromPublic = normalizeBaseUrl(process.env.PUBLIC_URL);
  if (fromPublic && !isLocalBaseUrl(fromPublic)) return fromPublic;

  const fromDomain = normalizeBaseUrl(process.env.DOMAIN);
  if (fromDomain && !isLocalBaseUrl(fromDomain)) return fromDomain;

  return BUILTIN_PUBLIC_ORIGINS[0] || fromClient || 'http://localhost:5173';
}
