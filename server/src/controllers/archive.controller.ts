import { Response } from 'express';
import { catchAsync } from '../middlewares/errorHandler';
import { AuthRequest } from '../middlewares/auth';
import { AppError } from '../utils/AppError';
import {
  getArchiveSummary,
  getArchivedEventsForMonth,
} from '../Services/eventArchive.service';

function requireTenant(req: AuthRequest, res: Response): string | null {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    res.status(403).json({ error: 'Tenant context is missing.' });
    return null;
  }
  return tenantId;
}

export const getArchiveSummaryHandler = catchAsync(async (req: AuthRequest, res: Response) => {
  const tenantId = requireTenant(req, res);
  if (!tenantId) return;
  const groups = await getArchiveSummary(tenantId);
  res.json({ success: true, data: groups });
});

export const getArchiveEventsHandler = catchAsync(async (req: AuthRequest, res: Response) => {
  const tenantId = requireTenant(req, res);
  if (!tenantId) return;

  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!Number.isInteger(year) || year < 1970 || year > 9999) {
    throw AppError.badRequest('יש לבחור שנה תקינה.');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw AppError.badRequest('יש לבחור חודש תקין (1–12).');
  }

  const result = await getArchivedEventsForMonth(
    tenantId,
    year,
    month,
    req.query as Record<string, unknown>,
  );
  res.json({ success: true, ...result });
});
