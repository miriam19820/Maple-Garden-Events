import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middlewares/auth';
import { requireRole } from '../middlewares/requireRole';
import { RBAC } from '../config/rbac';
import {
  assertUploadedFileMagicBytes,
  upload,
} from '../middlewares/uploadMiddleware';
import {
  assertAllowedS3ObjectKey,
  getPresignedDownloadUrl,
  isS3StorageEnabled,
  uploadPrivateFile,
} from '../utils/s3Storage';
import {
  assertBookingAccess,
  extractBookingIdFromObjectKey,
} from '../utils/bookingAccess';
import { catchAsync } from '../middlewares/errorHandler';
import { AppError } from '../utils/AppError';

const router = Router();

function accessUserFromReq(req: AuthRequest) {
  if (!req.user) return null;
  return {
    userId: req.user.userId,
    email: req.user.email,
    role: req.user.role,
  };
}

router.get(
  '/presigned',
  requireAuth,
  requireRole(...RBAC.MANAGEMENT),
  catchAsync(async (req: AuthRequest, res: Response) => {
    const key = typeof req.query.key === 'string' ? req.query.key : '';
    if (!key) {
      throw AppError.badRequest('חסר פרמטר key');
    }

    if (!isS3StorageEnabled()) {
      throw new AppError('אחסון S3 לא מוגדר', {
        statusCode: 503,
        code: 'S3_DISABLED',
        isOperational: true,
      });
    }

    const objectKey = assertAllowedS3ObjectKey(key);
    const bookingId = extractBookingIdFromObjectKey(objectKey);
    if (!bookingId) {
      throw AppError.badRequest('מפתח קובץ לא חוקי');
    }

    await assertBookingAccess(accessUserFromReq(req), bookingId);
    const url = await getPresignedDownloadUrl(objectKey);
    res.json({ success: true, url, objectKey });
  }),
);

router.post(
  '/upload',
  requireAuth,
  requireRole(...RBAC.MANAGEMENT),
  upload.single('file'),
  assertUploadedFileMagicBytes,
  catchAsync(async (req: AuthRequest, res: Response) => {
    if (!isS3StorageEnabled()) {
      throw new AppError('אחסון S3 לא מוגדר', {
        statusCode: 503,
        code: 'S3_DISABLED',
        isOperational: true,
      });
    }

    const file = req.file;
    const bookingId = typeof req.body.bookingId === 'string' ? req.body.bookingId : '';
    const category = typeof req.body.category === 'string' ? req.body.category : 'documents';

    if (!file || !bookingId) {
      throw AppError.badRequest('חסר קובץ או bookingId');
    }

    const allowedCategories = ['contracts', 'checks', 'signatures', 'documents'];
    if (!allowedCategories.includes(category)) {
      throw AppError.badRequest('קטגוריה לא חוקית');
    }

    const storedKey = await uploadPrivateFile({
      category,
      bookingId,
      fileName: file.originalname || 'upload.bin',
      contentType: file.mimetype || 'application/octet-stream',
      body: file.buffer,
      accessUser: accessUserFromReq(req),
    });
    const url = await getPresignedDownloadUrl(storedKey);
    res.json({ success: true, key: storedKey, url });
  }),
);

export default router;
