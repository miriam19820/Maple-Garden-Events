import { Request, Response } from 'express';
import { calendarService } from '../Services/calendar.service';
import { invalidateCache } from '../middlewares/cacheMiddleware';
import { catchAsync } from '../middlewares/errorHandler';
import { AppError } from '../utils/AppError';

export const calendarController = {
  getAllDates: catchAsync(async (req: Request, res: Response) => {
    const { start, end, eventType } = req.query;
    const parseLocalDateStart = (s: string) => {
      const [y, m, d] = s.split('-').map(Number);
      return new Date(y, m - 1, d, 0, 0, 0);
    };
    const parseLocalDateEnd = (s: string) => {
      const [y, m, d] = s.split('-').map(Number);
      return new Date(y, m - 1, d, 23, 59, 59, 999);
    };

    if (!start || !end || typeof start !== 'string' || typeof end !== 'string') {
      throw AppError.badRequest('חובה לשלוח פרמטרים start ו-end בפורמט YYYY-MM-DD');
    }

    const dates = await calendarService.getAllCalendarDates(
      parseLocalDateStart(start),
      parseLocalDateEnd(end),
      eventType as string,
    );
    res.json(dates);
  }),

  lockDate: catchAsync(async (req: Request, res: Response) => {
    const dateStr = req.params.dateStr as string;
    const { employeeName } = req.body;
    const tenantId = (req as any).user?.tenantId;
    const result = await calendarService.lockDateForChecking(dateStr, employeeName, tenantId);
    await invalidateCache('calendar');
    res.json(result);
  }),

  releaseDate: catchAsync(async (req: Request, res: Response) => {
    const dateStr = req.params.dateStr as string;
    const result = await calendarService.releaseDate(dateStr);
    await invalidateCache('calendar');
    res.json(result);
  }),

  createOption: catchAsync(async (req: Request, res: Response) => {
    const dateId = req.params.dateId as string;
    const bookingDetails = req.body;
    const result = await calendarService.createOption(dateId, bookingDetails);
    await invalidateCache('calendar');
    res.json(result);
  }),

  bookFinal: catchAsync(async (req: Request, res: Response) => {
    const dateId = req.params.dateId as string;
    const bookingDetails = req.body;
    const result = await calendarService.bookEventFinal(dateId, bookingDetails);
    await invalidateCache('calendar');
    res.json(result);
  }),
};
