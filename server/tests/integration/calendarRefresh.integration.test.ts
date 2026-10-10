/**
 * After closing/creating a booking, GET /calendar/dates must return it immediately.
 * This is the regression for the stale Redis/React Query calendar board.
 */

jest.mock('../../src/config/env', () => ({
  validateEnv: jest.fn(),
}));

jest.mock('../../src/utils/realtime', () => ({
  emitDateUpdated: jest.fn(),
  emitDateUpdatedMany: jest.fn(),
  emitBookingUpdated: jest.fn(),
  emitSettingsUpdated: jest.fn(),
}));

import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { Application } from 'express';
import prisma from '../../src/config/prisma';
import { csrfProtection } from '../../src/middlewares/csrf';
import { errorHandler } from '../../src/middlewares/errorHandler';
import bookingRoutes from '../../src/routes/booking';
import calendarRoutes from '../../src/routes/calendar.routes';
import { csrfHeaders, signTestToken, TEST_EMAIL } from '../helpers/authTestHelpers';
import {
  cleanupEventDateTree,
  createAvailableEventDate,
  ensureIntegrationFixtures,
  isDatabaseReachable,
  uniqueTestCalendarKey,
} from '../helpers/integrationDb';

const describeIntegration =
  process.env.RUN_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

function createCalendarApp(): Application {
  const app = express();
  app.use(cookieParser());
  app.use(csrfProtection);
  app.use(express.json({ limit: '12mb' }));
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/calendar', calendarRoutes);
  app.use(errorHandler);
  return app;
}

describeIntegration('Calendar refresh after booking create', () => {
  let app: Application;
  let eventDateId: string;
  let calendarKey: string;
  let tenantId: string;

  beforeAll(async () => {
    if (!(await isDatabaseReachable())) {
      throw new Error('Database unreachable.');
    }
    tenantId = await ensureIntegrationFixtures();
    app = createCalendarApp();
  }, 30_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    calendarKey = uniqueTestCalendarKey();
    const eventDate = await createAvailableEventDate(calendarKey, tenantId);
    eventDateId = eventDate.id;
  });

  afterEach(async () => {
    if (eventDateId) {
      await cleanupEventDateTree(eventDateId);
    }
  });

  it('shows a newly closed event on the calendar in the same request cycle', async () => {
    const token = signTestToken('manager', TEST_EMAIL);
    const { cookie, header } = csrfHeaders();
    const clientName = `Calendar Refresh ${calendarKey}`;

    const createRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', cookie)
      .set(header)
      .send({
        isOption: false,
        clientAFullName: clientName,
        clientAPhone: '0501234567',
        clientAEmail: '',
        createdBy: 'Calendar Refresh Test',
        timeOfDay: 'evening',
        eventType: 'חתונה',
        guestCount: 120,
        finalPricePortion: 250,
        allSelectedDates: [calendarKey],
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);

    const calendarRes = await request(app)
      .get('/api/calendar/dates')
      .query({ start: calendarKey, end: calendarKey, eventType: 'חתונה' })
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', cookie);

    expect(calendarRes.status).toBe(200);
    const days = Array.isArray(calendarRes.body)
      ? calendarRes.body
      : calendarRes.body?.data;
    expect(Array.isArray(days)).toBe(true);

    const day = days.find((d: { date?: string }) => d.date === calendarKey);
    expect(day).toBeTruthy();
    expect(day.status).toBe('BOOKED');

    const match = (day.bookings ?? []).find(
      (b: { clientAFullName?: string; isOption?: boolean }) =>
        b.clientAFullName === clientName && b.isOption === false,
    );
    expect(match).toBeTruthy();
  }, 30_000);
});
