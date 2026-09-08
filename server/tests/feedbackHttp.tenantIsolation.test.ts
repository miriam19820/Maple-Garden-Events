/**
 * HTTP-level tenant isolation for the feedback API.
 *
 * These are real HTTP requests through a real Express app mounting the real
 * `feedback.routes` — real `requireAuth` (JWT + DB role/tenant lookup), real
 * `requireRole`/RBAC, real CSRF middleware, real zod validation, real controller.
 * Only the Prisma client is replaced, by an in-memory fake that records the
 * `where` clauses each endpoint issues.
 *
 * Audit finding C5: the feedback controller contained no tenant filtering at all,
 * so an authenticated manager of tenant A could list, aggregate and re-send
 * tenant B's surveys — including reading live survey tokens.
 */

/** A civil day comfortably in the past, so `hasEventEnded` is true when the suite runs. */
const PAST_EVENT_DATE = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
PAST_EVENT_DATE.setHours(12, 0, 0, 0);

const tenantFixtures = {
  A: {
    tenantId: 't-a',
    email: 'manager-a@example.test',
    bookingId: '11111111-1111-4111-8111-111111111111',
  },
  B: {
    tenantId: 't-b',
    email: 'manager-b@example.test',
    bookingId: '22222222-2222-4222-8222-222222222222',
  },
};

/** Rows the fake Prisma client serves; every query is filtered by its `where`. */
const db = {
  authorizedUsers: [
    { id: 'u-a', email: tenantFixtures.A.email, role: 'manager', tenantId: 't-a' },
    { id: 'u-b', email: tenantFixtures.B.email, role: 'manager', tenantId: 't-b' },
  ],
  bookings: [
    {
      id: tenantFixtures.A.bookingId,
      tenantId: 't-a',
      isOption: false,
      eventCode: 'E-A',
      eventType: 'חתונה',
      clientAFullName: 'לקוח של A',
      clientAPhone: '050-1111111',
      clientAEmail: 'a@example.test',
      clientBFullName: 'בן זוג של A',
      clientBPhone: '050-2222222',
      clientBEmail: 'a2@example.test',
      eventDate: { date: PAST_EVENT_DATE, status: 'ARCHIVED' },
      eventForm: null,
      feedbacks: [],
    },
    {
      id: tenantFixtures.B.bookingId,
      tenantId: 't-b',
      isOption: false,
      eventCode: 'E-B',
      eventType: 'בר מצווה',
      clientAFullName: 'לקוח של B',
      clientAPhone: '050-3333333',
      clientAEmail: 'b@example.test',
      clientBFullName: null,
      clientBPhone: null,
      clientBEmail: null,
      eventDate: { date: PAST_EVENT_DATE, status: 'ARCHIVED' },
      eventForm: null,
      feedbacks: [],
    },
  ],
  feedbacks: [
    {
      id: 'fb-a',
      tenantId: 't-a',
      bookingId: tenantFixtures.A.bookingId,
      clientSide: 'A',
      clientName: 'לקוח של A',
      token: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
      foodRating: 5,
      serviceRating: 5,
      venueRating: 5,
      averageScore: 5,
      comments: 'מצוין',
      isCompleted: true,
      createdAt: new Date(2026, 8, 8),
      updatedAt: new Date(2026, 8, 8),
      lastNotifiedAt: new Date(2026, 8, 8),
      lastEmailSent: true,
      lastWhatsappSent: false,
      notifyAttempts: 1,
      lastNotifyAttemptAt: new Date(2026, 8, 8),
      lastNotifyError: null,
    },
    {
      id: 'fb-b',
      tenantId: 't-b',
      bookingId: tenantFixtures.B.bookingId,
      clientSide: 'A',
      clientName: 'לקוח של B',
      token: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
      foodRating: 1,
      serviceRating: 1,
      venueRating: 1,
      averageScore: 1,
      comments: 'סודי של טננט ב',
      isCompleted: true,
      createdAt: new Date(2026, 8, 8),
      updatedAt: new Date(2026, 8, 8),
      lastNotifiedAt: new Date(2026, 8, 8),
      lastEmailSent: true,
      lastWhatsappSent: false,
      notifyAttempts: 1,
      lastNotifyAttemptAt: new Date(2026, 8, 8),
      lastNotifyError: null,
    },
  ],
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const matchesTenant = (row: any, where: any) =>
  where?.tenantId === undefined || row.tenantId === where.tenantId;

const prismaFake = {
  authorizedUser: {
    findUnique: async ({ where }: any) =>
      db.authorizedUsers.find((u) => u.email === where.email) ?? null,
  },
  booking: {
    findMany: async ({ where }: any) =>
      db.bookings
        .filter((b) => matchesTenant(b, where))
        .map((b) => ({
          ...b,
          feedbacks: db.feedbacks.filter((f) => f.bookingId === b.id),
        })),
    findFirst: async ({ where }: any) =>
      db.bookings.find((b) => b.id === where.id && matchesTenant(b, where)) ?? null,
    findUnique: async ({ where }: any) => db.bookings.find((b) => b.id === where.id) ?? null,
  },
  feedback: {
    findUnique: async ({ where }: any) =>
      db.feedbacks.find((f) => (where.token ? f.token === where.token : f.id === where.id)) ?? null,
    findMany: async ({ where }: any) =>
      db.feedbacks
        .filter((f) => matchesTenant(f, where))
        .filter((f) => (where?.bookingId === undefined ? true : f.bookingId === where.bookingId))
        .filter((f) => (where?.isCompleted === undefined ? true : f.isCompleted === where.isCompleted))
        .filter((f) =>
          where?.booking?.tenantId === undefined
            ? true
            : db.bookings.find((b) => b.id === f.bookingId)?.tenantId === where.booking.tenantId,
        )
        .map((f) => ({
          ...f,
          booking: {
            ...db.bookings.find((b) => b.id === f.bookingId),
          },
        })),
    createMany: async ({ data }: any) => {
      const rows = Array.isArray(data) ? data : [data];
      let count = 0;
      for (const row of rows) {
        const clash = db.feedbacks.some(
          (f) => f.bookingId === row.bookingId && f.clientSide === row.clientSide,
        );
        if (clash) continue;
        db.feedbacks.push({
          id: `fb-${db.feedbacks.length + 1}`,
          foodRating: null, serviceRating: null, venueRating: null, averageScore: null,
          comments: null, isCompleted: false, createdAt: new Date(), updatedAt: new Date(),
          lastNotifiedAt: null, lastEmailSent: false, lastWhatsappSent: false,
          notifyAttempts: 0, lastNotifyAttemptAt: null, lastNotifyError: null,
          ...row,
        } as never);
        count++;
      }
      return { count };
    },
    updateMany: async () => ({ count: 0 }),
  },
  $transaction: async (fn: any) => fn(prismaFake),
};
/* eslint-enable @typescript-eslint/no-explicit-any */

jest.mock('../src/config/prisma', () => ({ __esModule: true, default: prismaFake }));
jest.mock('../src/utils/realtime', () => ({ emitFeedbackUpdated: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import feedbackRoutes from '../src/routes/feedback.routes';
import { errorHandler } from '../src/middlewares/errorHandler';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../src/utils/authCookie';

function createApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api/feedback', feedbackRoutes);
  app.use(errorHandler);
  return app;
}

function tokenFor(which: 'A' | 'B') {
  const fixture = tenantFixtures[which];
  return jwt.sign(
    { email: fixture.email, role: 'manager', name: `Manager ${which}` },
    process.env.JWT_SECRET as string,
    { expiresIn: '1h' },
  );
}

const CSRF = 'csrf-token-for-tests';
const app = createApp();

const authGet = (path: string, who: 'A' | 'B') =>
  request(app).get(path).set('Authorization', `Bearer ${tokenFor(who)}`);

const authPost = (path: string, who: 'A' | 'B') =>
  request(app)
    .post(path)
    .set('Authorization', `Bearer ${tokenFor(who)}`)
    .set('Cookie', [`${CSRF_COOKIE_NAME}=${CSRF}`])
    .set(CSRF_HEADER_NAME, CSRF);

describe('GET /api/feedback/admin/list', () => {
  it('tenant A sees only its own events', async () => {
    const res = await authGet('/api/feedback/admin/list', 'A');
    expect(res.status).toBe(200);
    const codes = res.body.data.map((g: { eventCode: string }) => g.eventCode);
    expect(codes).toEqual(['E-A']);
    expect(JSON.stringify(res.body)).not.toContain('E-B');
    expect(JSON.stringify(res.body)).not.toContain('לקוח של B');
  });

  it('tenant B sees only its own events', async () => {
    const res = await authGet('/api/feedback/admin/list', 'B');
    expect(res.status).toBe(200);
    const codes = res.body.data.map((g: { eventCode: string }) => g.eventCode);
    expect(codes).toEqual(['E-B']);
    expect(JSON.stringify(res.body)).not.toContain('E-A');
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/feedback/admin/list');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/feedback/admin/stats', () => {
  it("tenant A's statistics never include tenant B's responses", async () => {
    const res = await authGet('/api/feedback/admin/stats?year=all', 'A');
    expect(res.status).toBe(200);
    // Tenant A has one 5/5 response; tenant B has one 1/5 response.
    expect(res.body.data.counts.completedFeedbacks).toBe(1);
    expect(res.body.data.averages.combined).toBe(5);
    expect(res.body.data.counts.lowScore).toBe(0);
    expect(JSON.stringify(res.body)).not.toContain('סודי של טננט ב');
  });

  it("tenant B's statistics never include tenant A's responses", async () => {
    const res = await authGet('/api/feedback/admin/stats?year=all', 'B');
    expect(res.status).toBe(200);
    expect(res.body.data.counts.completedFeedbacks).toBe(1);
    expect(res.body.data.averages.combined).toBe(1);
    expect(res.body.data.counts.excellent).toBe(0);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/feedback/admin/stats');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/feedback/admin/send', () => {
  it("tenant A cannot re-send tenant B's survey — the booking is not found", async () => {
    const res = await authPost('/api/feedback/admin/send', 'A').send({
      bookingId: tenantFixtures.B.bookingId,
      sendNotifications: false,
    });
    expect(res.status).toBe(404);
    // No token, link or client data of tenant B may leak through the error path.
    expect(JSON.stringify(res.body)).not.toContain('bbbbbbbb');
    expect(JSON.stringify(res.body)).not.toContain('לקוח של B');
  });

  it("tenant B cannot re-send tenant A's survey", async () => {
    const res = await authPost('/api/feedback/admin/send', 'B').send({
      bookingId: tenantFixtures.A.bookingId,
      sendNotifications: false,
    });
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('aaaaaaaa');
  });

  it('a tenant can act on its own booking', async () => {
    const res = await authPost('/api/feedback/admin/send', 'A').send({
      bookingId: tenantFixtures.A.bookingId,
      clientSide: 'B',
      sendNotifications: false,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects a request without a CSRF token', async () => {
    const res = await request(app)
      .post('/api/feedback/admin/send')
      .set('Authorization', `Bearer ${tokenFor('A')}`)
      .send({ bookingId: tenantFixtures.A.bookingId });
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/feedback/admin/send')
      .set('Cookie', [`${CSRF_COOKIE_NAME}=${CSRF}`])
      .set(CSRF_HEADER_NAME, CSRF)
      .send({ bookingId: tenantFixtures.A.bookingId });
    expect(res.status).toBe(401);
  });
});

describe('public survey endpoints — token security', () => {
  it('a malformed token is rejected by validation, not looked up', async () => {
    const res = await request(app).get('/api/feedback/not-a-uuid');
    expect([400, 404]).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toContain('clientName');
  });

  it('a random well-formed token that does not exist returns 404', async () => {
    const res = await request(app).get('/api/feedback/99999999-9999-4999-8999-999999999999');
    expect(res.status).toBe(404);
  });

  it('an invalid rating is rejected', async () => {
    const res = await request(app)
      .post('/api/feedback/99999999-9999-4999-8999-999999999999')
      .send({ foodRating: 9, serviceRating: 5, venueRating: 5 });
    expect(res.status).toBe(400);
  });

  it('a missing rating is rejected', async () => {
    const res = await request(app)
      .post('/api/feedback/99999999-9999-4999-8999-999999999999')
      .send({ foodRating: 5, serviceRating: 5 });
    expect(res.status).toBe(400);
  });

  it('an unknown extra field is rejected (strict schema)', async () => {
    const res = await request(app)
      .post('/api/feedback/99999999-9999-4999-8999-999999999999')
      .send({ foodRating: 5, serviceRating: 5, venueRating: 5, isCompleted: false });
    expect(res.status).toBe(400);
  });

  it('an over-long comment is rejected', async () => {
    const res = await request(app)
      .post('/api/feedback/99999999-9999-4999-8999-999999999999')
      .send({ foodRating: 5, serviceRating: 5, venueRating: 5, comments: 'x'.repeat(2100) });
    expect(res.status).toBe(400);
  });
});
