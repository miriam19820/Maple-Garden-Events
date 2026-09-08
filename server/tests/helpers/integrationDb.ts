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
  await prisma.tenant.upsert({
    where: { id: TEST_TENANT_ID },
    create: { id: TEST_TENANT_ID, name: 'Integration Test Tenant', subdomain: TEST_TENANT_ID },
    update: {},
  });
  return TEST_TENANT_ID;
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

export async function createAvailableEventDate(calendarKey: string, tenantId = TEST_TENANT_ID) {
  return prisma.eventDate.create({
    data: {
      tenantId,
      date: calendarDateForStorage(calendarKey),
      status: 'AVAILABLE',
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
