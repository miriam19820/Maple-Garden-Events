import { createContext, useContext } from 'react';

export interface TenantBranding {
  venueName: string;
  logoUrl: string;
}

export const DEFAULT_BRANDING: TenantBranding = {
  venueName: 'Maple Garden Events',
  logoUrl: '/assets/maple-default-logo.png',
};

export const TenantBrandingContext = createContext<TenantBranding>(DEFAULT_BRANDING);

export const useTenantBranding = () => {
  return useContext(TenantBrandingContext);
};
