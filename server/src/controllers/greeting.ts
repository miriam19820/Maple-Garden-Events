import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import {
  cancelScheduledGreeting,
  fetchGreetingClients,
  formatResultMessage,
  isFutureSchedule,
  listScheduledGreetings,
  parseScheduledAt,
  scheduleGreeting,
  sendToAllClients,
} from '../Services/greetingService';
import { catchAsync } from '../middlewares/errorHandler';
import { AppError } from '../utils/AppError';

export const getScheduledGreetings = catchAsync(async (_req: AuthRequest, res: Response) => {
  const items = await listScheduledGreetings();
  res.json({ success: true, items });
});

export const cancelScheduledGreetingHandler = catchAsync(async (req: AuthRequest, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const result = await cancelScheduledGreeting(id);
  if (!result.ok) {
    throw AppError.badRequest(result.reason);
  }
  res.json({ success: true, message: 'הברכה המתוזמנת בוטלה.' });
});

export const sendGreeting = catchAsync(async (req: AuthRequest, res: Response) => {
  const { subject, message, scheduledDate, scheduledTime } = req.body;
  const file: Express.Multer.File | undefined = (req as AuthRequest & { file?: Express.Multer.File }).file;

  if (!subject || !message) {
    throw AppError.badRequest('נושא ותוכן הברכה הם שדות חובה.');
  }

  const clients = await fetchGreetingClients();
  if (clients.length === 0) {
    throw AppError.badRequest('לא נמצאו לקוחות במערכת.');
  }

  const hasSchedule = Boolean(scheduledDate && scheduledTime);
  const hasPartialSchedule = Boolean(scheduledDate || scheduledTime);

  if (hasPartialSchedule && !hasSchedule) {
    throw AppError.badRequest(
      'יש למלא גם תאריך וגם שעה לתזמון, או להשאיר את שניהם ריקים לשליחה מיידית.',
    );
  }

  if (hasSchedule) {
    let scheduledAt: Date;
    try {
      scheduledAt = parseScheduledAt(scheduledDate, scheduledTime);
    } catch {
      throw AppError.badRequest('תאריך או שעה לא תקינים.');
    }

    if (!isFutureSchedule(scheduledAt)) {
      throw AppError.badRequest('יש לבחור תאריך ושעה עתידיים לתזמון הברכה.');
    }

    const { tenantId } = req.user!;
    const createdBy = typeof req.user?.email === 'string' ? req.user.email : undefined;
    await scheduleGreeting({
      tenantId,
      subject,
      message,
      scheduledAt,
      file,
      createdBy,
    });

    const [year, month, day] = scheduledDate.split('-');
    const [hour, minute] = scheduledTime.split(':');

    return res.json({
      success: true,
      message: `הברכה מתוזמנת ל-${day}/${month}/${year} בשעה ${hour}:${minute} ל-${clients.length} לקוחות. השליחה תתבצע אוטומטית גם אם השרת יופעל מחדש.`,
    });
  }

  const stats = await sendToAllClients(clients, subject, message, file
    ? { filename: file.originalname, buffer: file.buffer }
    : undefined);
  const resultMessage = formatResultMessage(stats, clients.length);

  if (stats.emailSent === 0 && stats.whatsappSent === 0) {
    return res.status(400).json({
      success: false,
      message: resultMessage,
      emailSent: stats.emailSent,
      whatsappSent: stats.whatsappSent,
      skippedReasons: stats.skippedReasons,
    });
  }

  res.json({
    success: true,
    message: resultMessage,
    emailSent: stats.emailSent,
    whatsappSent: stats.whatsappSent,
    skippedReasons: stats.skippedReasons,
  });
});
