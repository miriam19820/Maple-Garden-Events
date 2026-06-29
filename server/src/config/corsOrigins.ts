/** Origins allowed for browser API calls (admin on localhost + public CLIENT_URL). */
export function getCorsOrigins(): string[] {
  const origins = new Set<string>();
  origins.add('http://localhost:5173');
  const clientUrl = process.env.CLIENT_URL?.replace(/\/$/, '');
  if (clientUrl) origins.add(clientUrl);
  return [...origins];
}

export function isAllowedCorsOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  return getCorsOrigins().includes(origin);
}
