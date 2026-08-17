import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import styles from './Toast.module.css';
import { ToastContext, type ToastTone } from './ToastContext';

type ToastItem = {
  id: string;
  message: string;
  tone: ToastTone;
};

const AUTO_DISMISS_MS = 3000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.viewport} aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`${styles.toast} ${styles[toast.tone]}`}
            role="status"
          >
            {toast.tone === 'success' ? (
              <span className={styles.icon} aria-hidden="true">
                ✓
              </span>
            ) : null}
            <span className={styles.message}>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
