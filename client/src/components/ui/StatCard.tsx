import type { NavIconName } from '../../utils/navConfig';
import { Icon } from './Icon';
import styles from './StatCard.module.css';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: NavIconName;
  trend?: string;
  loading?: boolean;
}

export function StatCard({ label, value, icon, trend, loading }: StatCardProps) {
  return (
    <article
      className={styles.card}
      aria-label={`${label}: ${loading ? 'טוען' : value}${trend ? `, ${trend}` : ''}`}
    >
      <div className={styles.accent} aria-hidden="true" />
      {icon && (
        <div className={styles.iconWrap} aria-hidden="true">
          <Icon name={icon} size={22} />
        </div>
      )}
      <div className={styles.content}>
        <p className={styles.label}>{label}</p>
        {loading ? (
          <div className={styles.skeleton} aria-hidden="true" />
        ) : (
          <p className={styles.value}>{value}</p>
        )}
        {trend && !loading && <p className={styles.trend}>{trend}</p>}
      </div>
    </article>
  );
}
