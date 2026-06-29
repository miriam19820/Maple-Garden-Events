import React from 'react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon?: string;
  title?: string;
  message?: string;
  action?: React.ReactNode;
}

export const EmptyState = ({
  icon = '📭',
  title = 'אין נתונים',
  message = 'לא נמצאו פריטים להצגה',
  action,
}: EmptyStateProps) => (
  <div className={styles.empty}>
    <div className={styles.icon} aria-hidden="true">
      {icon}
    </div>
    <h3 className={styles.title}>{title}</h3>
    <p className={styles.message}>{message}</p>
    {action && <div className={styles.action}>{action}</div>}
  </div>
);
