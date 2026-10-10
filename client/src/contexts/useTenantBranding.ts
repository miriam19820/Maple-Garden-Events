import { createContext, useContext } from 'react';
import { getBrandConfig } from '@shared/brand/index';

export interface TenantBranding {
  venueName: string;
  logoUrl: string;
}

const brand = getBrandConfig();

export const DEFAULT_BRANDING: TenantBranding = {
  venueName: brand.publicVenueName,
  logoUrl: brand.logoUrl,
};

export const TenantBrandingContext = createContext<TenantBranding>(DEFAULT_BRANDING);

export const useTenantBranding = () => {
  return useContext(TenantBrandingContext);
};
