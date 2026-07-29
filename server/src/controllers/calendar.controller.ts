import { Request, Response } from 'express';
import { calendarService } from '../Services/calendar.service';
import { invalidateCache } from '../middlewares/cacheMiddleware';
import { reportUnexpectedError } from '../utils/reportUnexpectedError';

export const calendarController = {

  async getAllDates(req: Request, res: Response) {
    try {
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
        return res.status(400).json({ error: 'חובה לשלוח פרמטרים start ו-end בפורמט YYYY-MM-DD' });
      }

      const dates = await calendarService.getAllCalendarDates(
        parseLocalDateStart(start),
        parseLocalDateEnd(end),
        eventType as string
      );
      res.json(dates);
    } catch (error) {
      reportUnexpectedError(error, {
        source: 'calendar.getAllDates',
        title: 'Calendar getAllDates failed',
        context: { start: req.query.start, end: req.query.end },
      });
      res.status(500).json({ error: 'שגיאה בשליפת התאריכים' });
    }
  },

  async lockDate(req: Request, res: Response) {
    try {
      const dateStr = req.params.dateStr as string;
      const { employeeName } = req.body;
      const tenantId = (req as any).user?.tenantId;
      const result = await calendarService.lockDateForChecking(dateStr, employeeName, tenantId);
      await invalidateCache('calendar');
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },

  async releaseDate(req: Request, res: Response) {
    try {
      const dateStr = req.params.dateStr as string;
      const result = await calendarService.releaseDate(dateStr);
      await invalidateCache('calendar');
      res.json(result);
    } catch (error) {
      reportUnexpectedError(error, {
        source: 'calendar.releaseDate',
        title: 'Calendar releaseDate failed',
        context: { dateStr: req.params.dateStr },
      });
      res.status(500).json({ error: 'שגיאה בשחרור התאריך' });
    }
  },

  async createOption(req: Request, res: Response) {
    try {
      const dateId = req.params.dateId as string;
      const bookingDetails = req.body;
      const result = await calendarService.createOption(dateId, bookingDetails);
      await invalidateCache('calendar');
      res.json(result);
    } catch (error) {
      reportUnexpectedError(error, {
        source: 'calendar.createOption',
        title: 'Calendar createOption failed',
        context: { dateId: req.params.dateId },
      });
      res.status(500).json({ error: 'שגיאה ביצירת אופציה' });
    }
  },

  async bookFinal(req: Request, res: Response) {
    try {
      const dateId = req.params.dateId as string;
      const bookingDetails = req.body;
      const result = await calendarService.bookEventFinal(dateId, bookingDetails);
      await invalidateCache('calendar');
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
};
