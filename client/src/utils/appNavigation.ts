export const ROUTE_TITLES: Record<string, string> = {
  '/dashboard': 'לוח בקרה',
  '/calendar': 'לוח שנה',
  '/booking': 'סגירת הזמנה',
  '/options-manager': 'ניהול אופציות',
  '/bookings-manager': 'ניהול הזמנות',
  '/greeting': 'שליחת ברכה',
  '/event-form-manager': 'טופס הפקת אירוע',
  '/option': 'שמירת אופציה',
  '/menu': 'תפריט',
  '/settings': 'הגדרות מתחם',
  '/feedback-manager': 'משובי לקוחות',
  '/feedback-stats': 'סטטיסטיקות וחישובים',
  '/gallery': 'גלריה',
};

export function resolveRouteTitle(pathname: string): string {
  if (pathname.startsWith('/booking/close-option/')) return 'סגירת הזמנה מאופציה';
  if (pathname.startsWith('/booking/edit/')) return 'עריכת הזמנה';
  if (pathname.startsWith('/feedback/')) return 'משוב לקוח';
  return ROUTE_TITLES[pathname] || '';
}

export function resolveDefaultBackPath(pathname: string): string {
  if (pathname.startsWith('/booking/close-option/')) return '/options-manager';
  if (pathname.startsWith('/booking/edit/')) return '/bookings-manager';
  if (pathname === '/gallery') return '/event-form-manager';
  if (pathname.startsWith('/feedback/')) return '/dashboard';
  return '/dashboard';
}

export function shouldShowGlobalBack(pathname: string): boolean {
  if (pathname === '/dashboard' || pathname === '/') return false;
  if (pathname === '/calendar') return false;
  if (pathname.startsWith('/feedback/')) return false;
  return true;
}
