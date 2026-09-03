/**
 * Centralised phone-number normalisation (§21).
 *
 * One representation everywhere: E.164 digits WITHOUT a leading '+', which is the
 * format Meta's Cloud API expects in the `to` field and returns in webhook `from`.
 *
 *   050-1234567      -> 972501234567
 *   0501234567       -> 972501234567
 *   +972 50-123-4567 -> 972501234567
 *   972501234567     -> 972501234567
 *
 * This supersedes the ad-hoc `formatPhoneForWhatsAppCloud` / `formatPhoneForWhatsApp`
 * helpers for all new code. Those remain for the existing Green API path.
 */

export type NormalizedPhone = {
  /** E.164 digits, no '+'. */
  value: string;
  /** Display form with a leading '+'. */
  e164: string;
  countryCode: string;
  national: string;
};

export interface IPhoneNumberNormalizer {
  normalize(raw: string): NormalizedPhone | null;
  isValid(raw: string): boolean;
  /** Split a raw ERP field that may hold several numbers ("050… | 052…"). */
  normalizeMany(...raw: Array<string | null | undefined>): string[];
}

/** Default country for bare national numbers. Israel unless overridden. */
const DEFAULT_COUNTRY_CODE = (process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '972').replace(/\D/g, '');

/** Country codes we can recognise on an unprefixed international number. */
const KNOWN_COUNTRY_CODES = ['972', '1', '44', '33', '49', '39', '34', '7', '380', '61', '81', '86', '91'];

/** Israeli mobile/landline national numbers are 9 digits after the leading 0. */
const IL_NATIONAL_LENGTH = 9;

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

export class PhoneNumberNormalizer implements IPhoneNumberNormalizer {
  constructor(private readonly defaultCountryCode: string = DEFAULT_COUNTRY_CODE) {}

  normalize(raw: string | null | undefined): NormalizedPhone | null {
    if (!raw || typeof raw !== 'string') return null;

    const trimmed = raw.trim();
    if (!trimmed) return null;

    const hadPlus = trimmed.startsWith('+') || trimmed.startsWith('00');
    let digits = digitsOnly(trimmed);
    if (trimmed.startsWith('00')) digits = digits.replace(/^00/, '');

    if (!digits) return null;

    let value: string;

    if (digits.startsWith(this.defaultCountryCode) && digits.length > this.defaultCountryCode.length) {
      // Already international for our default country.
      value = digits;
    } else if (digits.startsWith('0')) {
      // National form: drop the trunk prefix, prepend the country code.
      value = `${this.defaultCountryCode}${digits.slice(1)}`;
    } else if (hadPlus) {
      // Explicit international form for some other country — trust it.
      value = digits;
    } else {
      const known = KNOWN_COUNTRY_CODES.find(
        (cc) => cc !== this.defaultCountryCode && digits.startsWith(cc) && digits.length >= cc.length + 8,
      );
      value = known ? digits : `${this.defaultCountryCode}${digits}`;
    }

    // E.164 allows at most 15 digits and needs a sane minimum to be a real number.
    if (value.length < 8 || value.length > 15) return null;

    const countryCode = value.startsWith(this.defaultCountryCode)
      ? this.defaultCountryCode
      : (KNOWN_COUNTRY_CODES.find((cc) => value.startsWith(cc)) ?? this.defaultCountryCode);

    const national = value.slice(countryCode.length);
    if (!national) return null;

    // Extra guard for the primary market: Israeli numbers are exactly 9 national digits.
    if (countryCode === '972' && national.length !== IL_NATIONAL_LENGTH) return null;

    return { value, e164: `+${value}`, countryCode, national };
  }

  isValid(raw: string | null | undefined): boolean {
    return this.normalize(raw) !== null;
  }

  normalizeMany(...raw: Array<string | null | undefined>): string[] {
    const out = new Set<string>();
    for (const entry of raw) {
      if (!entry) continue;
      // ERP phone fields may hold several numbers separated by | , ; or newline.
      for (const part of String(entry).split(/[|,;\n]/)) {
        const normalized = this.normalize(part);
        if (normalized) out.add(normalized.value);
      }
    }
    return [...out];
  }
}

export const phoneNumberNormalizer: IPhoneNumberNormalizer = new PhoneNumberNormalizer();

/** Convenience wrapper — returns the E.164-without-plus string or null. */
export function normalizePhone(raw: string | null | undefined): string | null {
  return phoneNumberNormalizer.normalize(raw ?? '')?.value ?? null;
}

/**
 * Last 9 digits — used ONLY to shortlist candidate bookings in SQL before an exact
 * normalized comparison. Never used to decide a match on its own (§18, §22).
 */
export function phoneMatchSuffix(raw: string): string {
  const digits = digitsOnly(raw);
  return digits.length > 9 ? digits.slice(-9) : digits;
}
