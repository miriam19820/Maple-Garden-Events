import { useMemo } from 'react';

/**
 * Client-side mirror of RBAC.WHATSAPP_* in server/src/config/rbac.ts.
 *
 * This only decides what to RENDER. Every one of these is enforced again on the
 * server — hiding a button is not a security control (§20, §29).
 */
export interface WhatsAppPermissions {
  canView: boolean;
  canSend: boolean;
  canManageTemplates: boolean;
  canManageAutomations: boolean;
  canManageSettings: boolean;
}

export function whatsAppPermissionsForRole(role: string | null | undefined): WhatsAppPermissions {
  const isManager = role === 'manager';
  const isStaff = role === 'staff';
  return {
    canView: isManager || isStaff,
    canSend: isManager || isStaff,
    canManageTemplates: isManager,
    canManageAutomations: isManager,
    canManageSettings: isManager,
  };
}

export function useWhatsAppPermissions(role: string | null | undefined): WhatsAppPermissions {
  return useMemo(() => whatsAppPermissionsForRole(role), [role]);
}
