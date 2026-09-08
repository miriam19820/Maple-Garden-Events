/**
 * Regression tests for customer-facing feedback messaging.
 *
 * Audit finding C6: the Hebrew email body and WhatsApp message shipped a literal
 * `{shortName}` to customers, because `getBrandI18nParams` supplied only
 * `{venueName}` and the mailer passed no params for the body. The From display
 * name had the same defect via `brand.messaging.emailFromName`.
 *
 * These tests fail on ANY unresolved `{placeholder}` in a rendered message.
 */

jest.mock('../src/config/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getBrandConfig, getBrandI18nParams, resolveBrandText } from '@maple/shared/brand';
import { CATALOG, getTranslator } from '@maple/shared/i18n';
import { buildFeedbackRequestMail, getFromAddress } from '../src/utils/mailer';
import { buildFeedbackRequestWhatsAppMessage } from '../src/utils/whatsapp';

const PLACEHOLDER = /\{[A-Za-z_][A-Za-z0-9_]*\}/g;
const LOCALES = ['he', 'en'] as const;
const LINK = 'https://events.example.test/feedback/6f1f6b6e-0f2a-4d1e-9b6d-2f5c1a0d1234';

function unresolved(text: string): string[] {
  return text.match(PLACEHOLDER) ?? [];
}

describe('feedback email', () => {
  for (const locale of LOCALES) {
    it(`[${locale}] contains no unresolved placeholder in subject, html or text`, () => {
      const mail = buildFeedbackRequestMail('client@example.test', 'ישראל ישראלי', LINK, locale);
      expect(unresolved(String(mail.subject))).toEqual([]);
      expect(unresolved(String(mail.html))).toEqual([]);
      expect(unresolved(String(mail.text))).toEqual([]);
    });

    it(`[${locale}] carries the survey link in both the html and the plain-text part`, () => {
      const mail = buildFeedbackRequestMail('client@example.test', 'ישראל', LINK, locale);
      expect(String(mail.html)).toContain(LINK);
      expect(String(mail.text)).toContain(LINK);
    });

    it(`[${locale}] greets the recipient by first name`, () => {
      const mail = buildFeedbackRequestMail('client@example.test', 'ישראל ישראלי', LINK, locale);
      expect(String(mail.html)).toContain('ישראל');
      expect(String(mail.html)).not.toContain('{name}');
    });

    it(`[${locale}] names the venue instead of a placeholder`, () => {
      const brand = getBrandConfig();
      const mail = buildFeedbackRequestMail('client@example.test', null, LINK, locale);
      const expectedName = locale === 'en' ? 'Maple' : brand.shortName;
      expect(String(mail.html)).toContain(expectedName);
      expect(String(mail.html)).not.toContain('{shortName}');
    });
  }

  it('the sender display name resolves its brand placeholder', () => {
    const from = getFromAddress('he');
    expect(unresolved(from)).toEqual([]);
    expect(from).toContain(getBrandConfig().shortName);
  });

  it('is addressed to the recipient and has a non-empty subject', () => {
    const mail = buildFeedbackRequestMail('client@example.test', 'דנה', LINK, 'he');
    expect(mail.to).toBe('client@example.test');
    expect(String(mail.subject).length).toBeGreaterThan(0);
  });
});

describe('feedback WhatsApp message', () => {
  for (const locale of LOCALES) {
    it(`[${locale}] contains no unresolved placeholder and includes the link`, () => {
      const message = buildFeedbackRequestWhatsAppMessage('ישראל ישראלי', LINK, locale);
      expect(unresolved(message)).toEqual([]);
      expect(message).toContain(LINK);
    });
  }
});

describe('brand i18n params cover every brand placeholder in the catalog', () => {
  // Any SERVER.* string may be rendered without explicit params, so every brand
  // placeholder it uses must be auto-injected by getBrandI18nParams.
  const BRAND_PLACEHOLDERS = new Set(['venueName', 'shortName', 'displayName', 'phone']);

  for (const locale of LOCALES) {
    it(`[${locale}] getBrandI18nParams supplies every brand placeholder used`, () => {
      const provided = new Set(Object.keys(getBrandI18nParams(locale)));
      for (const name of BRAND_PLACEHOLDERS) {
        expect(provided.has(name)).toBe(true);
      }
    });

    it(`[${locale}] no SERVER.* string renders a brand placeholder verbatim`, () => {
      const { t } = getTranslator(locale);
      const offenders: string[] = [];

      const walk = (node: unknown, path: string) => {
        if (typeof node === 'string') {
          const names = (node.match(PLACEHOLDER) ?? []).map((m) => m.slice(1, -1));
          const brandOnes = names.filter((n) => BRAND_PLACEHOLDERS.has(n));
          if (brandOnes.length === 0) return;
          const rendered = t(path);
          for (const name of brandOnes) {
            if (rendered.includes(`{${name}}`)) offenders.push(`${path} → {${name}}`);
          }
          return;
        }
        if (node && typeof node === 'object') {
          for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
            walk(value, path ? `${path}.${key}` : key);
          }
        }
      };

      walk((CATALOG as Record<string, Record<string, unknown>>)[locale].SERVER, 'SERVER');
      expect(offenders).toEqual([]);
    });
  }

  it('brand messaging strings resolve their own placeholders', () => {
    const brand = getBrandConfig();
    for (const value of Object.values(brand.messaging)) {
      expect(unresolved(resolveBrandText(value))).toEqual([]);
    }
  });
});
