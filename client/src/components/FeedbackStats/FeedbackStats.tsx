import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './FeedbackStats.module.css';
import { useFeedbackStatsQuery } from '../../hooks/queries';

const MONTHS = [
  { value: '', label: 'כל השנה' },
  { value: '1', label: 'ינואר' },
  { value: '2', label: 'פברואר' },
  { value: '3', label: 'מרץ' },
  { value: '4', label: 'אפריל' },
  { value: '5', label: 'מאי' },
  { value: '6', label: 'יוני' },
  { value: '7', label: 'יולי' },
  { value: '8', label: 'אוגוסט' },
  { value: '9', label: 'ספטמבר' },
  { value: '10', label: 'אוקטובר' },
  { value: '11', label: 'נובמבר' },
  { value: '12', label: 'דצמבר' },
];

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00').toLocaleDateString('he-IL');
}

function stars(score: number | null) {
  if (score == null) return '—';
  const rounded = Math.round(score);
  return '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
}

function sideLabel(clientSide: string) {
  return clientSide === 'B' ? "צד ב'" : "צד א'";
}

const FeedbackStats = () => {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState('');

  const { data, isLoading } = useFeedbackStatsQuery(year, month);
  const stats = data;

  const currentYear = new Date().getFullYear();
  const defaultYears = useMemo(
    () => Array.from({ length: 5 }, (_, i) => String(currentYear - 2 + i)),
    [currentYear],
  );

  const extraYears = useMemo(() => {
    const fromApi = (stats?.availableYears ?? []).map(String);
    return fromApi.filter((y) => !defaultYears.includes(y));
  }, [stats?.availableYears, defaultYears]);

  const maxTypeAvg = stats?.byEventType.length
    ? Math.max(...stats.byEventType.map((t) => t.average ?? 0), 5)
    : 5;

  const maxCategoryAvg = stats?.categoryComparison.length
    ? Math.max(...stats.categoryComparison.map((c) => c.average ?? 0), 5)
    : 5;

  const maxMonthAvg = stats?.byMonth.length
    ? Math.max(...stats.byMonth.map((m) => m.average ?? 0), 5)
    : 5;

  const maxYearAvg = stats?.byYear.length
    ? Math.max(...stats.byYear.map((y) => y.average ?? 0), 5)
    : 5;

  const periodLabel = year === 'all'
    ? 'כל השנים'
    : year;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>📊 סטטיסטיקות וחישובים — משובי לקוחות</h2>
          <p className={styles.subtitle}>
            סיכום דירוגים, מגמות ואחוזי מילוי לפי תאריך האירוע.
          </p>
        </div>
        <div className={styles.filters}>
          <select className={styles.select} value={month} onChange={(e) => setMonth(e.target.value)}>
            {MONTHS.map((m) => (
              <option key={m.value || 'all'} value={m.value}>{m.label}</option>
            ))}
          </select>
          <select className={styles.select} value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="all">כל השנים</option>
            {defaultYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
            {extraYears.length > 0 && (
              <optgroup label="שנים נוספות עם משובים">
                {extraYears.map((y) => (
                  <option key={`extra-${y}`} value={y}>{y}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className={styles.loading}>טוען נתונים... ⏳</div>
      ) : !stats ? (
        <div className={styles.noData}>לא ניתן לטעון את הסטטיסטיקות.</div>
      ) : stats.counts.completedFeedbacks === 0 && stats.counts.totalEventsFinished === 0 ? (
        <div className={styles.noData}>
          אין נתוני משוב לתקופה זו. משובים יופיעו לאחר אירועים שהסתיימו.
          <div className={styles.linkRow}>
            <Link to="/feedback-manager" className={styles.linkBtn}>← לניהול משובים</Link>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>ממוצע כללי</span>
              <span className={styles.kpiValue}>
                {stats.averages.combined != null ? stats.averages.combined.toFixed(1) : '—'}
              </span>
              {stats.averages.combined != null && (
                <span className={styles.kpiSub}>{stars(stats.averages.combined)}</span>
              )}
            </div>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>אוכל</span>
              <span className={styles.kpiValue}>
                {stats.averages.food != null ? stats.averages.food.toFixed(1) : '—'}
              </span>
            </div>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>שירות</span>
              <span className={styles.kpiValue}>
                {stats.averages.service != null ? stats.averages.service.toFixed(1) : '—'}
              </span>
            </div>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>אולם</span>
              <span className={styles.kpiValue}>
                {stats.averages.venue != null ? stats.averages.venue.toFixed(1) : '—'}
              </span>
            </div>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>אחוז מילוי</span>
              <span className={styles.kpiValue}>
                {stats.responseRate != null ? `${stats.responseRate}%` : '—'}
              </span>
              <span className={styles.kpiSub}>
                {stats.counts.completedFeedbacks} / {stats.counts.expectedSides} משובים
              </span>
            </div>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>משובים נמוכים (≤3)</span>
              <span className={`${styles.kpiValue} ${stats.counts.lowScore > 0 ? styles.kpiValueWarn : ''}`}>
                {stats.counts.lowScore}
              </span>
            </div>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>מצוינים (≥4.5)</span>
              <span className={styles.kpiValue}>{stats.counts.excellent}</span>
            </div>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>ממתינים למילוי</span>
              <span className={styles.kpiValue}>{stats.counts.pendingFeedbacks}</span>
              <span className={styles.kpiSub}>{stats.counts.notSentEvents} טרם נשלחו</span>
            </div>
          </div>

          <div className={styles.twoCol}>
            {stats.categoryComparison.length > 0 && (
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>השוואת קטגוריות</h3>
                <div className={styles.barList}>
                  {stats.categoryComparison.map((item) => {
                    const pct = item.average != null ? (item.average / maxCategoryAvg) * 100 : 0;
                    return (
                      <div key={item.category} className={styles.barItem}>
                        <div className={styles.barHeader}>
                          <span>{item.category}</span>
                          <span>{item.average?.toFixed(1)} ★</span>
                        </div>
                        <div className={styles.barTrack}>
                          <div
                            className={`${styles.barFill} ${styles.barFillCategory}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {stats.byEventType.length > 0 && (
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>לפי סוג אירוע</h3>
                <div className={styles.barList}>
                  {stats.byEventType.map((item) => {
                    const pct = item.average != null ? (item.average / maxTypeAvg) * 100 : 0;
                    return (
                      <div key={item.eventType} className={styles.barItem}>
                        <div className={styles.barHeader}>
                          <span>{item.eventType} ({item.count})</span>
                          <span>{item.average?.toFixed(1)} ★</span>
                        </div>
                        <div className={styles.barTrack}>
                          <div className={styles.barFill} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {!month && year === 'all' && stats.byYear.length > 0 && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>ממוצע לפי שנה — כל השנים</h3>
              <div className={styles.monthChart}>
                {stats.byYear.map((item) => {
                  const heightPct = item.average != null ? (item.average / maxYearAvg) * 100 : 0;
                  return (
                    <div key={item.year} className={styles.monthCol}>
                      <span className={styles.monthScore}>
                        {item.average?.toFixed(1) ?? '—'}
                      </span>
                      <div className={styles.monthBarWrap}>
                        <div className={styles.monthBar} style={{ height: `${heightPct}%` }} />
                      </div>
                      <span className={styles.monthLabel}>{item.year}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!month && year !== 'all' && stats.byMonth.length > 0 && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>ממוצע לפי חודש — {periodLabel}</h3>
              <div className={styles.monthChart}>
                {stats.byMonth.map((item) => {
                  const heightPct = item.average != null ? (item.average / maxMonthAvg) * 100 : 0;
                  return (
                    <div key={item.month} className={styles.monthCol}>
                      <span className={styles.monthScore}>
                        {item.average?.toFixed(1) ?? '—'}
                      </span>
                      <div className={styles.monthBarWrap}>
                        <div className={styles.monthBar} style={{ height: `${heightPct}%` }} />
                      </div>
                      <span className={styles.monthLabel}>{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {stats.recentLow.length > 0 && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>⚠️ משובים נמוכים</h3>
              <div className={styles.lowList}>
                {stats.recentLow.map((item, idx) => (
                  <div key={`${item.eventCode}-${idx}`} className={styles.lowItem}>
                    <div className={styles.lowMeta}>
                      <span className={styles.eventCode}>#{item.eventCode}</span>
                      <span>{item.eventType}</span>
                      <span>{formatDate(item.eventDate)}</span>
                      <span>{item.clients}</span>
                      <span>{sideLabel(item.clientSide)}</span>
                      <span className={styles.scoreBadge}>{item.score.toFixed(1)}</span>
                    </div>
                    {item.comment && <p className={styles.lowText}>"{item.comment}"</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.recentComments.length > 0 && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>💬 הערות אחרונות</h3>
              <div className={styles.commentList}>
                {stats.recentComments.map((item, idx) => (
                  <div key={`${item.eventCode}-c-${idx}`} className={styles.commentItem}>
                    <div className={styles.commentMeta}>
                      <span className={styles.eventCode}>#{item.eventCode}</span>
                      <span>{formatDate(item.eventDate)}</span>
                      {item.score != null && (
                        <span className={`${styles.scoreBadge} ${styles.scoreBadgeGood}`}>
                          {item.score.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <p className={styles.commentText}>"{item.comment}"</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.linkRow}>
            <Link to="/feedback-manager" className={styles.linkBtn}>← לניהול משובים ושליחה</Link>
          </div>
        </>
      )}
    </div>
  );
};

export default FeedbackStats;
