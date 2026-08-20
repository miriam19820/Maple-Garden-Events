import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from '../../i18n/useTranslation';
import { formatDate } from '@shared/i18n/formatters';
import type { Locale } from '@shared/i18n';
import {
  EVENT_TYPE_KEY_BY_VALUE,
  HALL_ONLY_EVENT_TYPE,
  translateByValue,
} from '@shared/i18n/bookingLookups';
import { useArchiveEventsQuery, useArchiveSummaryQuery } from '../../hooks/queries';
import { type BookingApi } from '../../utils/bookingApi';
import { PageLoader } from '../PageLoader/PageLoader';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  EventCard,
  Input,
  PageHeader,
  SectionHeader,
  type DataTableColumn,
  type EventCardData,
} from '../ui';
import styles from './ArchiveManager.module.css';

function monthLabel(year: number, month: number, locale: Locale) {
  return formatDate(new Date(year, month - 1, 1), locale, { month: 'long' });
}

const ArchiveManager = () => {
  const { t, T, locale } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedYear = Number(searchParams.get('year')) || null;
  const selectedMonth = Number(searchParams.get('month')) || null;
  const [openYear, setOpenYear] = useState<number | null>(selectedYear);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const summaryQuery = useArchiveSummaryQuery();
  const eventsQuery = useArchiveEventsQuery(selectedYear, selectedMonth, debouncedSearch || undefined);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (openYear != null) return;
    const firstYear = summaryQuery.data?.[0]?.year;
    if (firstYear) setOpenYear(firstYear);
  }, [openYear, summaryQuery.data]);

  const formatEventType = (value?: string) =>
    translateByValue(t, EVENT_TYPE_KEY_BY_VALUE, value ?? '');

  const dateStr = (b: BookingApi) =>
    b.eventDate?.date ? formatDate(b.eventDate.date, locale) : t(T.COMMON.LABELS.EM_DASH);

  const toEventCard = (b: BookingApi): EventCardData => ({
    id: b.id,
    date: dateStr(b),
    code: b.eventCode,
    clientName: b.clientAFullName ?? '',
    clientNameB: b.clientBFullName,
    eventType: formatEventType(b.eventType),
    timeOfDay: b.timeOfDay ?? undefined,
    guestCount:
      b.eventType === HALL_ONLY_EVENT_TYPE
        ? t(T.BOOKINGS.EVENT_TYPE_HALL_ONLY_SHORT)
        : (b.guestCount ?? undefined),
    status: 'past',
    statusLabel: t(T.STATUS.ARCHIVED),
  });

  const openEvent = (booking: BookingApi) => {
    navigate(`/archive/${booking.id}`);
  };

  const selectMonth = (year: number, month: number) => {
    setSearchParams({ year: String(year), month: String(month) });
    setOpenYear(year);
  };

  const clearMonth = () => {
    setSearchParams({});
    setSearch('');
  };

  const columns: DataTableColumn<BookingApi>[] = [
    { key: 'date', header: t(T.BOOKINGS.COL_DATE), render: (b) => dateStr(b) },
    {
      key: 'code',
      header: t(T.BOOKINGS.COL_CODE),
      render: (b) => (b.eventCode ? `#${b.eventCode}` : t(T.COMMON.LABELS.EM_DASH)),
    },
    { key: 'client', header: t(T.BOOKINGS.COL_CLIENT), render: (b) => b.clientAFullName },
    { key: 'type', header: t(T.BOOKINGS.COL_TYPE), render: (b) => formatEventType(b.eventType) },
    {
      key: 'guests',
      header: t(T.BOOKINGS.COL_GUESTS),
      render: (b) =>
        b.eventType === HALL_ONLY_EVENT_TYPE ? t(T.COMMON.LABELS.EM_DASH) : (b.guestCount ?? t(T.COMMON.LABELS.EM_DASH)),
    },
    {
      key: 'status',
      header: t(T.BOOKINGS.COL_STATUS),
      render: () => <Badge variant="past">{t(T.STATUS.ARCHIVED)}</Badge>,
    },
    {
      key: 'actions',
      header: t(T.BOOKINGS.COL_ACTIONS),
      render: (b) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            openEvent(b);
          }}
        >
          {t(T.ARCHIVE.VIEW_EVENT)}
        </Button>
      ),
    },
  ];

  const monthTitle = useMemo(() => {
    if (!selectedYear || !selectedMonth) return '';
    return `${monthLabel(selectedYear, selectedMonth, locale)} ${selectedYear}`;
  }, [selectedYear, selectedMonth, locale]);

  const events = eventsQuery.data?.data ?? [];

  return (
    <div className={styles.container}>
      <PageHeader title={t(T.ARCHIVE.PAGE_TITLE)} subtitle={t(T.ARCHIVE.PAGE_SUBTITLE)} />

      {summaryQuery.isLoading ? (
        <PageLoader />
      ) : summaryQuery.isError ? (
        <EmptyState
          title={t(T.ARCHIVE.LOAD_ERROR)}
          message={summaryQuery.error instanceof Error ? summaryQuery.error.message : t(T.ARCHIVE.LOAD_ERROR)}
          action={
            <Button variant="secondary" onClick={() => void summaryQuery.refetch()}>
              {t(T.COMMON.ACTIONS.RETRY)}
            </Button>
          }
        />
      ) : !summaryQuery.data?.length ? (
        <EmptyState
          icon="📦"
          title={t(T.ARCHIVE.EMPTY_TITLE)}
          message={t(T.ARCHIVE.EMPTY_MESSAGE)}
        />
      ) : selectedYear && selectedMonth ? (
        <div className={styles.events}>
          <div className={styles.backRow}>
            <Button variant="secondary" size="sm" onClick={clearMonth}>
              {t(T.ARCHIVE.BACK_TO_MONTHS)}
            </Button>
          </div>
          <SectionHeader title={monthTitle} count={eventsQuery.data?.pagination.total} />
          <Input
            fieldClassName={styles.searchInput}
            placeholder={t(T.ARCHIVE.SEARCH_PLACEHOLDER)}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t(T.ARCHIVE.SEARCH_ARIA)}
          />
          {eventsQuery.isLoading ? (
            <PageLoader />
          ) : eventsQuery.isError ? (
            <EmptyState
              title={t(T.ARCHIVE.LOAD_ERROR)}
              action={
                <Button variant="secondary" onClick={() => void eventsQuery.refetch()}>
                  {t(T.COMMON.ACTIONS.RETRY)}
                </Button>
              }
            />
          ) : events.length === 0 ? (
            <EmptyState icon="📅" title={t(T.ARCHIVE.NO_EVENTS_MONTH)} />
          ) : (
            <>
              <div className={styles.tableWrap}>
                <DataTable
                  caption={monthTitle}
                  columns={columns}
                  data={events}
                  rowKey={(b) => b.id}
                  onRowClick={openEvent}
                />
              </div>
              <div className={styles.cardsWrap}>
                {events.map((b) => (
                  <EventCard
                    key={b.id}
                    event={toEventCard(b)}
                    onView={() => openEvent(b)}
                    viewLabel={t(T.ARCHIVE.VIEW_EVENT)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className={styles.years}>
          {summaryQuery.data.map((group) => {
            const expanded = openYear === group.year;
            return (
              <section key={group.year} className={styles.yearBlock}>
                <button
                  type="button"
                  className={styles.yearToggle}
                  aria-expanded={expanded}
                  onClick={() => setOpenYear(expanded ? null : group.year)}
                >
                  <span>{t(T.ARCHIVE.YEAR, { year: group.year })}</span>
                  <span className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`} aria-hidden>
                    ▾
                  </span>
                </button>
                {expanded && (
                  <div className={styles.months} role="list">
                    {group.months.map((item) => (
                      <button
                        key={`${group.year}-${item.month}`}
                        type="button"
                        className={styles.monthBtn}
                        onClick={() => selectMonth(group.year, item.month)}
                      >
                        <span className={styles.monthName}>
                          {monthLabel(group.year, item.month, locale)}
                        </span>
                        <span className={styles.monthCount}>
                          {t(T.ARCHIVE.MONTH_EVENTS, { count: item.count })}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ArchiveManager;
