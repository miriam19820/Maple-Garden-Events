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
  }

  // Example for loading dynamic JSON config based on tenantName.
  // In a real multi-tenant setup with many brands, this might read a JSON file 
  // or fetch from a database at app startup. For now, we fallback to default.
  if (tenantName === 'maple' || !tenantName) {
    currentBrand = defaultBrand;
  } else {
    // Fallback to default if tenant is not recognized
    // Ideally we would load `${tenantName}.json` here.
    currentBrand = defaultBrand;
  }

  return currentBrand;
}

export * from './types';
export * from './defaultBrand';
