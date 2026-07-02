import styles from './Skeleton.module.css';

interface SkeletonProps {
  width?: string;
  height?: string;
  className?: string;
}

export function Skeleton({ width = '100%', height = '1rem', className = '' }: SkeletonProps) {
  return (
    <div
      className={`${styles.skeleton} ${className}`}
      style={{ width, height }}
      role="status"
      aria-busy="true"
      aria-label="טוען"
    />
  );
}

export function SkeletonGroup({ rows = 3 }: { rows?: number }) {
  return (
    <div className={styles.group} role="status" aria-busy="true" aria-label="טוען">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height="2.5rem" />
      ))}
    </div>
  );
}
