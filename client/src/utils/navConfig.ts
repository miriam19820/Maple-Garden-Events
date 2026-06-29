export interface NavItem {
  label: string;
  path: string;
  icon: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'לוח שנה', path: '/', icon: '📅' },
  { label: 'הגדרות מתחם', path: '/settings', icon: '⚙️' },
  { label: 'ניהול אופציות', path: '/options-manager', icon: '📋' },
  { label: 'ניהול הזמנות', path: '/bookings-manager', icon: '📝' },
  { label: 'משובי לקוחות', path: '/feedback-manager', icon: '⭐' },
  { label: 'סטטיסטיקות וחישובים', path: '/feedback-stats', icon: '📊' },
  { label: 'שליחת ברכה', path: '/greeting', icon: '💌' },
  { label: 'טופס הפקת אירוע', path: '/event-form-manager', icon: '🎉' },
];

export function isNavItemActive(pathname: string, itemPath: string): boolean {
  if (itemPath === '/') return pathname === '/';
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}
