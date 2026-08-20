import prisma from '../../src/config/prisma';
import { calendarDateForStorage } from '../../src/utils/dateLocal';
import { TEST_EMAIL } from './authTestHelpers';

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
  let tenant = await prisma.tenant.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: 'Integration Test Tenant', subdomain: `integration-test-${Date.now()}`, isActive: true },
    });
  }

  await prisma.authorizedUser.upsert({
    where: { email: TEST_EMAIL },
    create: { email: TEST_EMAIL, role: 'manager', tenantId: tenant.id },
    update: { role: 'manager', tenantId: tenant.id },
  });

  await prisma.systemSettings.upsert({
    where: { id: 'global' },
    create: { id: 'global', tenantId: tenant.id },
    update: {},
  });

  return tenant.id;
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
