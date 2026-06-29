import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useNavigationContext } from '../../context/NavigationContext';
import {
  resolveDefaultBackPath,
  resolveRouteTitle,
  shouldShowGlobalBack,
} from '../../utils/appNavigation';
import './AppHeader.css';

const NAV_ITEMS = [
  { label: 'לוח שנה', path: '/', icon: '📅' },
  { label: 'הגדרות מתחם', path: '/settings', icon: '⚙️' },
  { label: 'ניהול אופציות', path: '/options-manager', icon: '' },
  { label: 'ניהול הזמנות', path: '/bookings-manager', icon: '' },
  { label: 'משובי לקוחות', path: '/feedback-manager', icon: '⭐' },
  { label: 'סטטיסטיקות וחישובים', path: '/feedback-stats', icon: '📊' },
  { label: 'שליחת ברכה', path: '/greeting', icon: '💌' },
  { label: 'טופס הפקת אירוע', path: '/event-form-manager', icon: '' },
];

export const AppHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { override } = useNavigationContext();
  const [menuOpen, setMenuOpen] = useState(false);

  const showBack = shouldShowGlobalBack(location.pathname) || !!override;
  const pageTitle = resolveRouteTitle(location.pathname);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const goTo = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };

  const handleBack = () => {
    setMenuOpen(false);
    if (override?.onBack) {
      override.onBack();
      return;
    }
    const fallback = resolveDefaultBackPath(location.pathname);
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(fallback);
  };

  return (
    <>
      <header className="app-header">
        <div className="app-header-start">
          <button
            type="button"
            className="app-header-hamburger"
            onClick={() => setMenuOpen(true)}
            aria-label="פתיחת תפריט"
            aria-expanded={menuOpen}
          >
            <span />
            <span />
            <span />
          </button>

          {showBack && (
            <button
              type="button"
              className="app-header-back"
              onClick={handleBack}
              aria-label={pageTitle ? `חזרה — ${pageTitle}` : 'חזרה'}
            >
              <span className="app-header-back-icon" aria-hidden="true">→</span>
              <span className="app-header-back-text">חזרה</span>
            </button>
          )}

          {pageTitle && (
            <p className="app-header-title" title={pageTitle}>
              {pageTitle}
            </p>
          )}
        </div>

        <button
          type="button"
          className="app-header-brand"
          onClick={() => goTo('/')}
          aria-label="חזרה ללוח השנה"
        >
          <img src="/logo.png" alt="מיפל - גן אירועים בעיר" className="app-header-logo" />
        </button>
      </header>

      {menuOpen && (
        <div className="nav-drawer-overlay" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      )}

      <nav className={`nav-drawer ${menuOpen ? 'nav-drawer-open' : ''}`} aria-hidden={!menuOpen}>
        <div className="nav-drawer-header">
          <img src="/logo.png" alt="" className="nav-drawer-logo" />
          <button
            type="button"
            className="nav-drawer-close"
            onClick={() => setMenuOpen(false)}
            aria-label="סגירת תפריט"
          >
            ✕
          </button>
        </div>
        <ul className="nav-drawer-list">
          {NAV_ITEMS.map((item) => (
            <li key={item.path}>
              <button
                type="button"
                className={`nav-drawer-item ${location.pathname === item.path ? 'active' : ''}`}
                onClick={() => goTo(item.path)}
              >
                {item.icon && <span className="nav-drawer-icon">{item.icon}</span>}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
};
