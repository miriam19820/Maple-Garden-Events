import { Router, type Response } from 'express';
import prisma from '../config/prisma';
import { requireAuth, type AuthRequest } from '../middlewares/auth';
import { requireRole } from '../middlewares/requireRole';
import { RBAC } from '../config/rbac';
import { validate } from '../middlewares/validate';
import { updateKashrutSchema } from '../validators/kashrut.validator';
import { emitSettingsUpdated } from '../utils/realtime';
import { catchAsync } from '../middlewares/errorHandler';
import { AppError } from '../utils/AppError';
import { NotFoundError } from '../utils/httpErrors';

const router = Router();

router.use(requireAuth);

const DEFAULT_CERT = {
  nameKey: 'main',
  displayName: 'תעודת כשרות',
  isGlobalCertificate: true,
};

async function ensureTenantCertificate(tenantId: string) {
  const existing = await prisma.kashrutCertificate.findMany({
    where: { tenantId },
    orderBy: { updatedAt: 'desc' },
  });
  if (existing.length > 0) return existing;

  const created = await prisma.kashrutCertificate.create({
    data: { ...DEFAULT_CERT, tenantId },
  });
  return [created];
}

router.get(
  '/',
  requireRole(...RBAC.MENU_READ),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      throw AppError.forbidden('Tenant context is missing.');
    }

    const kashruts = await ensureTenantCertificate(tenantId);
    res.json(kashruts);
  }),
);

router.put(
  '/:id',
  requireRole(...RBAC.MENU_WRITE),
  validate(updateKashrutSchema),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      throw AppError.forbidden('Tenant context is missing.');
    }

    const { id } = req.params;
    const { imageUrl, validUntil } = req.body as { imageUrl?: string; validUntil?: string };

    const owned = await prisma.kashrutCertificate.findFirst({
      where: { id: id as string, tenantId },
    });
    if (!owned) {
      throw new NotFoundError('תעודה לא נמצאה');
    }

    const updated = await prisma.kashrutCertificate.update({
      where: { id: owned.id },
      data: {
        ...(imageUrl !== undefined ? { imageUrl } : {}),
        ...(validUntil !== undefined && validUntil !== ''
          ? { validUntil: new Date(validUntil) }
          : validUntil === ''
            ? { validUntil: null }
            : {}),
      },
    });

    res.json({ success: true, data: updated });
    emitSettingsUpdated();
  }),
);

export default router;
