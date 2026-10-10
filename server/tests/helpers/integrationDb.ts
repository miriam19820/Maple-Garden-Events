import prisma from '../../src/config/prisma';
import { calendarDateForStorage } from '../../src/utils/dateLocal';
import { TEST_EMAIL } from './authTestHelpers';

/**
 * Every row in this schema belongs to a tenant, so the integration fixtures need
 * one. These helpers previously created AuthorizedUser / SystemSettings /
 * EventDate without it, which did not type-check — the whole integration suite
 * failed to compile.
 */
export const TEST_TENANT_ID = 'integration-test-tenant';

export async function ensureTestTenant(): Promise<string> {
  // SystemSettings.id is a global singleton (`global`). The booking path reads
  // that row, so fixtures must use the same tenant it already belongs to —
  // usually the first active staging/prod tenant. A dedicated test tenant
  // leaves settings on tenant A and the test user on tenant B, and CI 500s.
  const existingSettings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
  if (existingSettings?.tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: existingSettings.tenantId } });
    if (tenant) return tenant.id;
  }

  let tenant = await prisma.tenant.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: 'Integration Test Tenant', subdomain: `integration-test-${Date.now()}`, isActive: true },
    });
  }
  return tenant.id;
}

/** מפתח תאריך ייחודי (2031, יום שלישי) — ערב מותר; לא שישי/שבת בעייתיים */
let testTuesdayOffset = 0;

export function uniqueTestCalendarKey(): string {
  testTuesdayOffset += 1;
  // 2031-01-07 הוא יום שלישי — קפיצות של 7 ימים שומרות על שלישי
  const d = new Date(2031, 0, 7 + (testTuesdayOffset - 1) * 7, 12, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function ensureIntegrationFixtures(): Promise<string> {
  const tenantId = await ensureTestTenant();

  await prisma.authorizedUser.upsert({
    where: { email: TEST_EMAIL },
    create: { email: TEST_EMAIL, role: 'manager', tenantId },
    update: { role: 'manager', tenantId },
  });

  await prisma.systemSettings.upsert({
    where: { id: 'global' },
    create: { id: 'global', tenantId },
    update: {},
  });

  return tenantId;
}

export async function createAvailableEventDate(calendarKey: string, tenantId: string) {
  return prisma.eventDate.create({
    data: {
      date: calendarDateForStorage(calendarKey),
      status: 'AVAILABLE',
      tenantId,
    },
  });
}

export async function cleanupEventDateTree(eventDateId: string): Promise<void> {
  await prisma.booking.deleteMany({ where: { calendarDateId: eventDateId } });
  await prisma.eventDate.deleteMany({ where: { id: eventDateId } });
}

export async function isDatabaseReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
