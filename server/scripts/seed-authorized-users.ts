/**
 * Seed authorized users for Go-Live (all manager role per GO-LIVE-DECISIONS.md).
 *
 * Usage (from server/):
 *   AUTHORIZED_USERS_EMAILS=admin@example.com,staff@example.com npm run seed:authorized-users
 *   npm run seed:authorized-users -- --dry-run
 */
import dotenv from 'dotenv';
import prisma from '../src/config/prisma';

dotenv.config();

const DEFAULT_TENANT = {
  name: 'Maple HQ',
  subdomain: 'maple',
} as const;

async function ensureDefaultTenant() {
  let tenant = await prisma.tenant.findFirst({
    where: { subdomain: DEFAULT_TENANT.subdomain },
  });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { ...DEFAULT_TENANT, isActive: true },
    });
    console.log(`  ✅ Tenant created: ${tenant.name} (${tenant.id})`);

    await prisma.systemSettings.upsert({
      where: { id: 'global' },
      create: { id: 'global', tenantId: tenant.id, nextEventNumber: 1000 },
      update: { tenantId: tenant.id },
    });
    console.log('  ✅ System settings initialized');
  } else {
    console.log(`  ℹ️ Using tenant: ${tenant.name} (${tenant.id})`);
  }

  return tenant;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const raw = process.env.AUTHORIZED_USERS_EMAILS?.trim();

  if (!raw) {
    console.error('❌ Set AUTHORIZED_USERS_EMAILS (comma-separated emails).');
    process.exit(1);
  }

  const emails = [...new Set(
    raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
  )];

  if (emails.length === 0) {
    console.error('❌ No valid emails in AUTHORIZED_USERS_EMAILS.');
    process.exit(1);
  }

  console.log(dryRun ? '🔍 Dry run — no DB changes.' : '🌱 Seeding authorized users (role=manager)...');

  const tenant = dryRun ? null : await ensureDefaultTenant();

  for (const email of emails) {
    if (dryRun) {
      console.log(`  would upsert: ${email} → manager (tenant: ${DEFAULT_TENANT.subdomain})`);
      continue;
    }

    const user = await prisma.authorizedUser.upsert({
      where: { email },
      create: { email, role: 'manager', tenantId: tenant!.id },
      update: { role: 'manager', tenantId: tenant!.id },
    });
    console.log(`  ✅ ${user.email} (${user.role}, tenant ${user.tenantId})`);
  }

  console.log(`\nDone — ${emails.length} user(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
