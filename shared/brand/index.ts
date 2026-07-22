import { BrandConfig } from './types';
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

export * from './types';
export * from './defaultBrand';
