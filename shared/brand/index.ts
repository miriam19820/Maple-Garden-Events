import type { BrandConfig } from './types';
import { defaultBrand } from './defaultBrand';

let currentBrand: BrandConfig | null = null;
let tenantOverride: string | undefined;

/** Set tenant explicitly (e.g. from Vite `import.meta.env` in client bootstrap). */
export function setBrandTenant(name: string) {
  tenantOverride = name;
  currentBrand = null;
}

/**
 * Returns the active brand configuration.
 * On Node/Server, it uses `process.env.TENANT_NAME`.
 * On Vite/Frontend, call `setBrandTenant` from client bootstrap before first use.
 */
export function getBrandConfig(): BrandConfig {
  if (currentBrand) return currentBrand;

  let tenantName = tenantOverride;
  if (!tenantName && typeof process !== 'undefined' && process.env?.TENANT_NAME) {
    tenantName = process.env.TENANT_NAME;
  } else if (typeof window !== 'undefined' && (window as Window & { __TENANT_NAME__?: string }).__TENANT_NAME__) {
    tenantName = (window as Window & { __TENANT_NAME__?: string }).__TENANT_NAME__;
    if (tenantName === '%VITE_TENANT_NAME%') {
      tenantName = undefined;
    }
  }

  if (tenantName === 'maple' || !tenantName) {
    currentBrand = defaultBrand;
  } else {
    currentBrand = defaultBrand;
  }

  return currentBrand;
}

/**
 * Params auto-injected into every translated string so that brand placeholders
 * (`{venueName}`, `{shortName}`, `{displayName}`, `{phone}`) always resolve.
 *
 * IMPORTANT: every brand placeholder used anywhere in the locale catalogs must be
 * listed here. `interpolate()` emits unknown placeholders verbatim, so a missing
 * entry means a literal `{shortName}` reaches the customer.
 * Guarded by `server/tests/feedbackMessages.test.ts`.
 */
export function getBrandI18nParams(locale?: string): {
  venueName: string;
  shortName: string;
  displayName: string;
  phone: string;
} {
  const brand = getBrandConfig();
  return {
    venueName: locale === 'en' ? brand.publicVenueNameEn : brand.publicVenueName,
    shortName: brand.shortName,
    displayName: brand.displayName,
    phone: brand.phone,
  };
}

/**
 * Resolve brand placeholders inside a raw brand string (e.g. `messaging.emailFromName`,
 * stored as `'גן אירועים {shortName}'`). Brand strings live outside the i18n catalog,
 * so they never pass through `interpolate()` on their own.
 */
export function resolveBrandText(template: string, locale?: string): string {
  const params = getBrandI18nParams(locale) as Record<string, string>;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] !== undefined ? params[name] : match,
  );
}

export * from './types';
export * from './defaultBrand';
