import React from 'react';
import * as Sentry from '@sentry/react';
import { useTranslation } from '../../i18n/useTranslation';
import styles from './ErrorFallback.module.css';

interface ErrorFallbackProps {
  error?: Error;
  resetError?: () => void;
  /** Sentry event id when the boundary reported the crash */
  eventId?: string | null;
}

export const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, resetError, eventId }) => {
  const { t, T } = useTranslation();
  return (
    <div className={styles.errorFallback}>
      <h1>{t(T.UI.ERROR_TITLE)}</h1>
      <p>{t(T.UI.ERROR_MESSAGE)}</p>
      {eventId ? (
        <p className={styles.errorRef} dir="ltr">
          Ref: {eventId}
        </p>
      ) : null}
      {import.meta.env.DEV && error && (
        <pre>{error.stack || error.message}</pre>
      )}
      <div className={styles.errorActions}>
        {resetError && (
          <button type="button" onClick={resetError} className="maple-btn maple-btn-primary">
            {t(T.COMMON.ACTIONS.RETRY)}
          </button>
        )}
        {eventId && import.meta.env.VITE_SENTRY_DSN ? (
          <button
            type="button"
            className="maple-btn maple-btn-secondary"
            onClick={() => Sentry.showReportDialog({ eventId })}
          >
            {t(T.UI.ERROR_REPORT)}
          </button>
        ) : null}
      </div>
    </div>
  );
};
