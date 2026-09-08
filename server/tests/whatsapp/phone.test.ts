/**
 * Phone normalisation (§37) — one canonical representation for every input form.
 */

import { PhoneNumberNormalizer, normalizePhone, phoneMatchSuffix } from '../../src/Services/whatsapp/phone';

describe('PhoneNumberNormalizer', () => {
  const normalizer = new PhoneNumberNormalizer('972');

  it.each([
    ['050-1234567', '972501234567'],
    ['0501234567', '972501234567'],
    ['+972501234567', '972501234567'],
    ['972501234567', '972501234567'],
    ['+972 50-123-4567', '972501234567'],
    ['00972501234567', '972501234567'],
    ['  052 999 8888  ', '972529998888'],
    ['052.999.8888', '972529998888'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normalizer.normalize(input)?.value).toBe(expected);
  });

  it('exposes the display form with a leading plus', () => {
    expect(normalizer.normalize('0501234567')?.e164).toBe('+972501234567');
  });

  it('splits the country code from the national number', () => {
    const parsed = normalizer.normalize('0501234567');
    expect(parsed?.countryCode).toBe('972');
    expect(parsed?.national).toBe('501234567');
  });

  it.each([
    ['', 'empty'],
    ['   ', 'whitespace'],
    ['abc', 'letters'],
    ['12345', 'too short'],
    ['05012345', 'israeli number one digit short'],
    ['05012345678', 'israeli number one digit long'],
    ['9725012345678901234', 'beyond E.164 length'],
  ])('rejects %s (%s)', (input) => {
    expect(normalizer.normalize(input)).toBeNull();
    expect(normalizer.isValid(input)).toBe(false);
  });

  it('returns null for null and undefined rather than throwing', () => {
    expect(normalizer.normalize(null as unknown as string)).toBeNull();
    expect(normalizer.normalize(undefined as unknown as string)).toBeNull();
  });

  it('keeps an explicit international number for another country', () => {
    expect(normalizer.normalize('+14155552671')?.value).toBe('14155552671');
  });

  describe('normalizeMany', () => {
    it('splits the ERP multi-phone field and de-duplicates', () => {
      expect(normalizer.normalizeMany('050-1234567 | 0529998888')).toEqual([
        '972501234567',
        '972529998888',
      ]);
    });

    it('collapses different spellings of the same number', () => {
      expect(normalizer.normalizeMany('050-1234567', '+972501234567', '972501234567')).toEqual([
        '972501234567',
      ]);
    });

    it('drops unparseable fragments instead of failing the whole field', () => {
      expect(normalizer.normalizeMany('0501234567, garbage, 123')).toEqual(['972501234567']);
    });

    it('ignores null and empty entries', () => {
      expect(normalizer.normalizeMany(null, undefined, '')).toEqual([]);
    });
  });
});

describe('normalizePhone helper', () => {
  it('returns the E.164 digits or null', () => {
    expect(normalizePhone('050-1234567')).toBe('972501234567');
    expect(normalizePhone('nope')).toBeNull();
  });
});

describe('phoneMatchSuffix', () => {
  it('returns the last nine digits for SQL shortlisting', () => {
    expect(phoneMatchSuffix('972501234567')).toBe('501234567');
    expect(phoneMatchSuffix('+972-50-123-4567')).toBe('501234567');
  });
});
