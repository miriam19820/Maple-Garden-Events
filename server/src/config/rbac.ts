import { UserRole } from '../middlewares/requireRole';

/**
 * קבוצות תפקידים לפי מטריצת ההרשאות (PRD §2.3).
 * manager = מנהל מערכת | staff = נציג | production = הפקה | floor_staff = קבלה
 */
export function isFloorStaffRole(role: string | undefined | null): boolean {
  return role === 'floor_staff';
}

export const RBAC = {
  /** הגדרות מתחם, ניהול משתמשים, פעולות כספיות מלאות */
  MANAGER_ONLY: ['manager'] as UserRole[],

  /** ניהול הזמנות, לוח שנה (כולל יצירת אופציה), משוב, ברכות */
  MANAGEMENT: ['manager', 'staff'] as UserRole[],

  /** צפייה בלוח שנה בלבד */
  CALENDAR_READ: ['manager', 'staff', 'production'] as UserRole[],

  /** כתיבה בלוח שנה (נעילה, אופציה, הזמנה) */
  CALENDAR_WRITE: ['manager', 'staff'] as UserRole[],

  /** טופס הפקה — קריאה */
  EVENT_FORM_READ: ['manager', 'staff', 'production'] as UserRole[],

  /** טופס הפקה — כתיבה */
  EVENT_FORM_WRITE: ['manager', 'production'] as UserRole[],

  /** תפריט / כשרויות — קריאה */
  MENU_READ: ['manager', 'staff', 'production'] as UserRole[],

  /** תפריט / כשרויות — כתיבה */
  MENU_WRITE: ['manager', 'production'] as UserRole[],

  /** צ'ק-אין LIVE (floor_staff — עם בדיקת יום ב-controller) */
  CHECK_IN: ['manager', 'staff', 'production', 'floor_staff'] as UserRole[],

  /** משוב admin — צפייה ושליחת קישור */
  FEEDBACK_ADMIN: ['manager', 'staff'] as UserRole[],

  /** EasyCount — צפייה בסטטוס בלבד (ללא הפקת מסמכים) */
  FINANCE_READ: ['manager', 'staff'] as UserRole[],

  // --- WhatsApp (§29) -------------------------------------------------------
  // Mapped onto the existing role model rather than a parallel permission system.

  /** WhatsApp.View / WhatsApp.ViewConversations — read the inbox */
  WHATSAPP_VIEW: ['manager', 'staff'] as UserRole[],

  /** WhatsApp.Send — send a message to a customer */
  WHATSAPP_SEND: ['manager', 'staff'] as UserRole[],

  /** WhatsApp.ManageTemplates — create/edit local template rows */
  WHATSAPP_MANAGE_TEMPLATES: ['manager'] as UserRole[],

  /** WhatsApp.ManageAutomations — enable/disable automation rules */
  WHATSAPP_MANAGE_AUTOMATIONS: ['manager'] as UserRole[],

  /** WhatsApp.ManageSettings — view integration status/health */
  WHATSAPP_MANAGE_SETTINGS: ['manager'] as UserRole[],
} as const;
