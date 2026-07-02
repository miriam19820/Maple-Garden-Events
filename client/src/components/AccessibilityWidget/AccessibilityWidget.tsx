import { useEffect, useId, useRef, useState } from 'react';
import type { AccessibilitySettings } from '../../accessibility/accessibilitySettings';
import { useAccessibility } from '../../context/AccessibilityContext';
import styles from './AccessibilityWidget.module.css';

type ToolAction =
  | 'increaseText'
  | 'decreaseText'
  | 'grayscale'
  | 'highContrast'
  | 'negativeContrast'
  | 'lightBackground'
  | 'highlightLinks'
  | 'readableFont'
  | 'reset';

const TOOLS: Array<{
  id: ToolAction;
  label: string;
  icon: string;
  activeKey?: keyof AccessibilitySettings;
}> = [
  { id: 'increaseText', label: 'הגדל טקסט', icon: 'A+' },
  { id: 'decreaseText', label: 'הקטן טקסט', icon: 'A−' },
  { id: 'grayscale', label: 'גווני אפור', icon: '◐', activeKey: 'grayscale' },
  { id: 'highContrast', label: 'ניגודיות גבוהה', icon: '◑', activeKey: 'highContrast' },
  { id: 'negativeContrast', label: 'ניגודיות הפוכה', icon: '◎', activeKey: 'negativeContrast' },
  { id: 'lightBackground', label: 'רקע בהיר', icon: '☀', activeKey: 'lightBackground' },
  { id: 'highlightLinks', label: 'הדגשת קישורים', icon: '🔗', activeKey: 'highlightLinks' },
  { id: 'readableFont', label: 'פונט קריא', icon: 'Aa', activeKey: 'readableFont' },
  { id: 'reset', label: 'איפוס', icon: '↺' },
];

export function AccessibilityWidget() {
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const {
    settings,
    increaseText,
    decreaseText,
    toggleGrayscale,
    toggleHighContrast,
    toggleNegativeContrast,
    toggleLightBackground,
    toggleHighlightLinks,
    toggleReadableFont,
    reset,
    canIncreaseText,
    canDecreaseText,
  } = useAccessibility();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const runAction = (action: ToolAction) => {
    switch (action) {
      case 'increaseText':
        if (canIncreaseText) increaseText();
        break;
      case 'decreaseText':
        if (canDecreaseText) decreaseText();
        break;
      case 'grayscale':
        toggleGrayscale();
        break;
      case 'highContrast':
        toggleHighContrast();
        break;
      case 'negativeContrast':
        toggleNegativeContrast();
        break;
      case 'lightBackground':
        toggleLightBackground();
        break;
      case 'highlightLinks':
        toggleHighlightLinks();
        break;
      case 'readableFont':
        toggleReadableFont();
        break;
      case 'reset':
        reset();
        break;
      default:
        break;
    }
  };

  const isActive = (action: ToolAction) => {
    if (action === 'reset') return false;
    const tool = TOOLS.find((item) => item.id === action);
    if (!tool?.activeKey) return false;
    return Boolean(settings[tool.activeKey]);
  };

  const isDisabled = (action: ToolAction) => {
    if (action === 'increaseText') return !canIncreaseText;
    if (action === 'decreaseText') return !canDecreaseText;
    return false;
  };

  return (
    <div className={`${styles.root} a11y-widget`} ref={panelRef}>
      {open && (
        <section
          id={panelId}
          className={`${styles.panel} a11y-widget-panel`}
          aria-label="כלי נגישות"
        >
          <header className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>כלי נגישות</h2>
          </header>
          <ul className={styles.toolList}>
            {TOOLS.map((tool) => (
              <li key={tool.id}>
                <button
                  type="button"
                  className={[
                    styles.toolBtn,
                    isActive(tool.id) ? styles.toolBtnActive : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => runAction(tool.id)}
                  disabled={isDisabled(tool.id)}
                  aria-pressed={tool.activeKey ? isActive(tool.id) : undefined}
                >
                  <span className={styles.toolIcon} aria-hidden="true">
                    {tool.icon}
                  </span>
                  <span>{tool.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button
        type="button"
        className={`${styles.toggle} a11y-widget-toggle`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? 'סגירת כלי נגישות' : 'פתיחת כלי נגישות'}
        onClick={() => setOpen((prev) => !prev)}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 2c1.5 3.1 4.3 5.3 7.7 5.8-.4 4.8-2.7 9.2-6.4 12.1L12 22l-1.3-1.1C7 17.9 4.7 13.5 4.3 8.8 7.7 8.3 10.5 6.1 12 2zm0 4.2C10.8 8.9 9.1 10.5 7 11.2 7.4 14.5 9 17.4 12 19.5c3-2.1 4.6-5 5-8.3-2.1-.7-3.8-2.3-5-5z"
          />
          <circle cx="12" cy="9" r="1.6" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}
