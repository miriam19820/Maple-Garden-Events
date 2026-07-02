export type NavIconName =
  | 'dashboard'
  | 'calendar'
  | 'settings'
  | 'clipboard'
  | 'bookings'
  | 'star'
  | 'chart'
  | 'mail'
  | 'event';

export interface NavItem {
  label: string;
  path: string;
  icon: NavIconName;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'לוח בקרה', path: '/dashboard', icon: 'dashboard' },
  { label: 'לוח שנה', path: '/calendar', icon: 'calendar' },
  { label: 'הגדרות מתחם', path: '/settings', icon: 'settings' },
  { label: 'ניהול אופציות', path: '/options-manager', icon: 'clipboard' },
  { label: 'ניהול הזמנות', path: '/bookings-manager', icon: 'bookings' },
  { label: 'משובי לקוחות', path: '/feedback-manager', icon: 'star' },
  { label: 'סטטיסטיקות וחישובים', path: '/feedback-stats', icon: 'chart' },
  { label: 'שליחת ברכה', path: '/greeting', icon: 'mail' },
  { label: 'טופס הפקת אירוע', path: '/event-form-manager', icon: 'event' },
];

export function isNavItemActive(pathname: string, itemPath: string): boolean {
  if (itemPath === '/dashboard') return pathname === '/dashboard' || pathname === '/';
  if (itemPath === '/calendar') return pathname === '/calendar';
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}
