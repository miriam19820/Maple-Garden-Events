export const ROUTE_TITLES: Record<string, string> = {
  '/booking': 'סגירת הזמנה',
  '/options-manager': 'ניהול אופציות',
  '/bookings-manager': 'ניהול הזמנות',
  '/greeting': 'שליחת ברכה',
  '/event-form-manager': 'טופס הפקת אירוע',
  '/option': 'שמירת אופציה',
  '/menu': 'תפריט',
  '/settings': 'הגדרות מתחם',
  '/feedback-manager': 'משובי לקוחות',
  '/gallery': 'גלריה',
};

export function resolveRouteTitle(pathname: string): string {
  if (pathname.startsWith('/booking/edit/')) return 'עריכת הזמנה';
  if (pathname.startsWith('/feedback/')) return 'משוב לקוח';
  return ROUTE_TITLES[pathname] || '';
}

export function resolveDefaultBackPath(pathname: string): string {
  if (pathname.startsWith('/booking/edit/')) return '/bookings-manager';
  if (pathname === '/gallery') return '/event-form-manager';
  if (pathname.startsWith('/feedback/')) return '/';
  return '/';
}

export function shouldShowGlobalBack(pathname: string): boolean {
  if (pathname === '/') return false;
  if (pathname.startsWith('/feedback/')) return false;
  return true;
}
