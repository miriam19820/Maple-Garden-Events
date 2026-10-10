/**
 * Public site URL used in customer email links must never stay on localhost
 * when the operator is on a live dashboard (admin.maple-g.co.il or nip.io).
 */

jest.mock('../src/config/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('../src/utils/realtime', () => ({ emitFeedbackUpdated: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  BUILTIN_PUBLIC_ORIGINS,
  getConfiguredPublicOrigins,
  isLocalBaseUrl,
  normalizeBaseUrl,
  originFromRequest,
  resolvePublicBaseUrl,
} from '../src/config/publicBaseUrl';
import { getCorsOrigins, isAllowedCorsOrigin } from '../src/config/corsOrigins';
import { getClientFeedbackUrl } from '../src/utils/feedbackHelpers';
import { getFeedbackDashboardUrl } from '../src/utils/feedbackAnomaly';

const URL_KEYS = ['CLIENT_URL', 'PUBLIC_URL', 'DOMAIN', 'PUBLIC_ORIGINS', 'NODE_ENV'] as const;
const STAGING = 'https://16.164.102.207.nip.io';
const ADMIN = 'https://admin.maple-g.co.il';

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of URL_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('normalizeBaseUrl', () => {
  it('strips a trailing slash and adds https when the scheme is missing', () => {
    expect(normalizeBaseUrl('admin.maple-g.co.il/')).toBe(ADMIN);
  });
});

describe('isLocalBaseUrl', () => {
  it('treats empty and loopback hosts as local', () => {
    expect(isLocalBaseUrl(undefined)).toBe(true);
    expect(isLocalBaseUrl('http://localhost:5173')).toBe(true);
    expect(isLocalBaseUrl('http://127.0.0.1:5000')).toBe(true);
  });

  it('treats both live dashboards as public', () => {
    expect(isLocalBaseUrl(STAGING)).toBe(false);
    expect(isLocalBaseUrl(ADMIN)).toBe(false);
  });
});

describe('originFromRequest', () => {
  it('prefers forwarded proto/host so nginx HTTPS is kept', () => {
    const req = {
      protocol: 'http',
      get: (name: string) => {
        if (name === 'x-forwarded-proto') return 'https';
        if (name === 'x-forwarded-host') return 'admin.maple-g.co.il';
        if (name === 'host') return 'localhost:5000';
        return undefined;
      },
    };
    expect(originFromRequest(req)).toBe(ADMIN);
  });

  it('defaults a public host to https when the proto header is missing', () => {
    const req = {
      protocol: 'http',
      get: (name: string) => (name === 'host' ? 'admin.maple-g.co.il' : undefined),
    };
    expect(originFromRequest(req)).toBe(ADMIN);
  });
});

describe('resolvePublicBaseUrl', () => {
  it('uses the admin dashboard origin even when CLIENT_URL is localhost', () => {
    process.env.CLIENT_URL = 'http://localhost:5173';
    expect(resolvePublicBaseUrl(ADMIN)).toBe(ADMIN);
  });

  it('uses the staging nip.io origin when that is the open tab', () => {
    process.env.CLIENT_URL = ADMIN;
    expect(resolvePublicBaseUrl(STAGING)).toBe(STAGING);
  });

  it('uses CLIENT_URL for cron when it is already public', () => {
    process.env.CLIENT_URL = ADMIN;
    expect(resolvePublicBaseUrl()).toBe(ADMIN);
  });

  it('falls back to DOMAIN when CLIENT_URL is local and there is no request', () => {
    process.env.CLIENT_URL = 'http://localhost:5173';
    process.env.DOMAIN = '16.164.102.207.nip.io';
    expect(resolvePublicBaseUrl()).toBe(STAGING);
  });

  it('falls back to the built-in admin host when nothing else public is configured', () => {
    expect(resolvePublicBaseUrl()).toBe(ADMIN);
    expect(BUILTIN_PUBLIC_ORIGINS).toContain(ADMIN);
  });
});

describe('CORS', () => {
  it('always allows the admin dashboard origin', () => {
    process.env.CLIENT_URL = 'http://localhost:5173';
    expect(getConfiguredPublicOrigins()).toContain(ADMIN);
    expect(isAllowedCorsOrigin(ADMIN)).toBe(true);
  });

  it('allows extra PUBLIC_ORIGINS such as the staging nip.io host', () => {
    process.env.PUBLIC_ORIGINS = STAGING;
    expect(getCorsOrigins()).toEqual(expect.arrayContaining([ADMIN, STAGING]));
    expect(isAllowedCorsOrigin(STAGING)).toBe(true);
  });
});

describe('email link builders', () => {
  it('builds a feedback survey link on the admin host', () => {
    process.env.CLIENT_URL = 'http://localhost:5173';
    expect(getClientFeedbackUrl('tok-1', ADMIN)).toBe(`${ADMIN}/feedback/tok-1`);
  });

  it('builds a manager dashboard link on the admin host', () => {
    process.env.CLIENT_URL = 'http://localhost:5173';
    expect(getFeedbackDashboardUrl('b-1', ADMIN)).toBe(`${ADMIN}/feedback-manager?bookingId=b-1`);
  });
});
