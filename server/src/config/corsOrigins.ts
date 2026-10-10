import { getConfiguredPublicOrigins, normalizeBaseUrl } from './publicBaseUrl';

/** Origins allowed for browser API calls (admin hosts + public CLIENT_URL). */
export function getCorsOrigins(): string[] {
  const origins = new Set<string>(getConfiguredPublicOrigins());

  const clientUrl = normalizeBaseUrl(process.env.CLIENT_URL);
  if (clientUrl) origins.add(clientUrl);

  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:5173');
  }

  return [...origins];
}

export function isAllowedCorsOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  return getCorsOrigins().includes(origin);
}
