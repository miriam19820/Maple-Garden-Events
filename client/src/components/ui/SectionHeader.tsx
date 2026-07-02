import styles from './SectionHeader.module.css';

interface SectionHeaderProps {
  title: string;
  count?: number;
  action?: React.ReactNode;
  as?: 'h2' | 'h3';
}

export function SectionHeader({ title, count, action, as: Tag = 'h2' }: SectionHeaderProps) {
  return (
    <div className={styles.wrap}>
      <Tag className={styles.title}>
        {title}
        {count !== undefined && (
          <span className={styles.count} aria-label={`${count} פריטים`}>
            {count}
          </span>
        )}
      </Tag>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
