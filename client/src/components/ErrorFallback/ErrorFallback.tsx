import React from 'react';
import styles from './ErrorFallback.module.css';

interface ErrorFallbackProps {
  error?: Error;
  resetError?: () => void;
}

export const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, resetError }) => (
  <div className={styles.errorFallback}>
    <h1>משהו השתבש</h1>
    <p>השגיאה נשלחה לצוות הפיתוח. ניתן לנסות שוב.</p>
    {import.meta.env.DEV && error && (
      <pre>{error.message}</pre>
    )}
    {resetError && (
      <button type="button" onClick={resetError} className="maple-btn maple-btn-primary">
        נסה שוב
      </button>
    )}
  </div>
);
