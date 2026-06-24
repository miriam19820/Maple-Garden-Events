import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../../services/api';
import { getBookableSlotsForDate } from '../../../utils/timeSlot';
import styles from '../BookingForm.module.css';

export type OptionDateItem = { date: string; hebrewDate?: string };

const MAX_OPTION_DATES = 3;
const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const COL_HEADERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

function formatDateLocal(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDisplay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function getDayOfWeek(dateStr: string): string {
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  return days[new Date(dateStr + 'T12:00:00').getDay()];
}

function getHebrewDateLabel(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long' }).format(
      new Date(dateStr + 'T12:00:00')
    );
  } catch {
    return '';
  }
}

function getEventTypeFilter(eventType: string): string {
  return eventType === 'חתונה' || eventType === 'אירוסין' ? 'חתונה' : 'אירוע אחר';
}

async function resolveOptionDate(
  date: string,
  eventType: string,
  excludeDates: string[]
): Promise<{ ok: true; item: OptionDateItem } | { ok: false; error: string }> {
  const todayStr = formatDateLocal(new Date());
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: 'יש לבחור תאריך תקין.' };
  }
  if (date < todayStr) {
    return { ok: false, error: 'לא ניתן לבחור תאריך בעבר.' };
  }
  if (excludeDates.includes(date)) {
    return { ok: false, error: 'התאריך כבר נבחר באופציה.' };
  }

  try {
    const filter = getEventTypeFilter(eventType);
    const res = await apiFetch(
      `http://localhost:5000/api/calendar/dates?start=${date}&end=${date}&eventType=${filter}`
    );
    const data = await res.json();
    const day = data?.[0];
    const bookings = day?.bookings ?? [];
    if (bookings.length > 0 && getBookableSlotsForDate(date, bookings).length === 0) {
      return { ok: false, error: 'אין משבצות פנויות בתאריך זה.' };
    }
    if (day?.status === 'BLOCKED' || day?.status === 'FORBIDDEN') {
      return { ok: false, error: 'התאריך חסום בלוח.' };
    }
    return {
      ok: true,
      item: { date, hebrewDate: day?.hebrewDate || getHebrewDateLabel(date) },
    };
  } catch {
    return { ok: true, item: { date, hebrewDate: getHebrewDateLabel(date) } };
  }
}

export function normalizeOptionDate(d: string | OptionDateItem): OptionDateItem {
  if (typeof d === 'object' && d?.date) return d;
  return { date: String(d), hebrewDate: '' };
}

interface OptionDatePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: OptionDateItem) => void;
  excludeDates: string[];
  eventType: string;
}

export const OptionDatePickerModal = ({
  isOpen,
  onClose,
  onSelect,
  excludeDates,
  eventType,
}: OptionDatePickerModalProps) => {
  const [current, setCurrent] = useState(() => new Date());
  const [days, setDays] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [manualDate, setManualDate] = useState('');
  const [manualError, setManualError] = useState('');
  const [manualAdding, setManualAdding] = useState(false);

  const eventTypeFilter = getEventTypeFilter(eventType);
  const todayStr = formatDateLocal(new Date());

  useEffect(() => {
    if (!isOpen) return;
    setManualDate('');
    setManualError('');
    const year = current.getFullYear();
    const month = current.getMonth();
    const start = formatDateLocal(new Date(year, month, 1));
    const end = formatDateLocal(new Date(year, month + 1, 0));

    setLoading(true);
    apiFetch(`http://localhost:5000/api/calendar/dates?start=${start}&end=${end}&eventType=${eventTypeFilter}`)
      .then(r => r.json())
      .then(setDays)
      .catch(() => setDays([]))
      .finally(() => setLoading(false));
  }, [isOpen, current, eventTypeFilter]);

  if (!isOpen) return null;

  const year = current.getFullYear();
  const month = current.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const serverMap = new Map(days.map((d: any) => [d.date, d]));

  const cells: (null | { date: string; hebrewDate: string; disabled: boolean; reason?: string })[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const date = formatDateLocal(new Date(year, month, day));
    const srv = serverMap.get(date);
    const status = srv?.status ?? 'AVAILABLE';
    const bookings = srv?.bookings ?? [];
    const hasBookableSlots = getBookableSlotsForDate(date, bookings).length > 0;
    const noFreeSlots = bookings.length > 0 && !hasBookableSlots;
    const disabled =
      date < todayStr ||
      excludeDates.includes(date) ||
      status === 'BLOCKED' ||
      status === 'FORBIDDEN' ||
      noFreeSlots;
    cells.push({
      date,
      hebrewDate: srv?.hebrewDate ?? '',
      disabled,
      reason: disabled
        ? excludeDates.includes(date)
          ? 'כבר נבחר'
          : noFreeSlots
            ? 'אין משבצות פנויות'
            : status === 'BLOCKED' || status === 'FORBIDDEN'
              ? 'חסום'
              : 'עבר'
        : undefined,
    });
  }

  const handleManualAdd = async () => {
    setManualError('');
    setManualAdding(true);
    const result = await resolveOptionDate(manualDate, eventType, excludeDates);
    setManualAdding(false);
    if (!result.ok) {
      setManualError(result.error);
      return;
    }
    onSelect(result.item);
    onClose();
  };

  return (
    <div className={styles.optionPickerOverlay} onClick={onClose}>
      <div className={styles.optionPickerModal} onClick={e => e.stopPropagation()}>
        <div className={styles.optionPickerHeader}>
          <h4>בחירת תאריך לאופציה</h4>
          <button type="button" className={styles.optionPickerClose} onClick={onClose}>✕</button>
        </div>

        <div className={styles.optionPickerManual}>
          <label className={styles.optionPickerManualLabel}>הזנה ידנית</label>
          <div className={styles.optionDatesAddRow}>
            <input
              type="date"
              className={styles.optionManualInput}
              value={manualDate}
              min={todayStr}
              onChange={e => {
                setManualDate(e.target.value);
                setManualError('');
              }}
            />
            <button
              type="button"
              className={styles.optionManualAddBtn}
              onClick={handleManualAdd}
              disabled={!manualDate || manualAdding}
            >
              {manualAdding ? 'בודק...' : 'הוסף'}
            </button>
          </div>
          {manualError && <p className={styles.optionManualError}>{manualError}</p>}
        </div>

        <p className={styles.optionPickerOr}>או בחרי מהלוח</p>

        <div className={styles.optionPickerNav}>
          <button type="button" onClick={() => setCurrent(new Date(year, month + 1, 1))}>‹</button>
          <span>{MONTH_NAMES[month]} {year}</span>
          <button type="button" onClick={() => setCurrent(new Date(year, month - 1, 1))}>›</button>
        </div>
        {loading ? (
          <p className={styles.optionPickerLoading}>טוען...</p>
        ) : (
          <>
            <div className={styles.optionPickerWeekdays}>
              {COL_HEADERS.map(d => <span key={d}>{d}</span>)}
            </div>
            <div className={styles.optionPickerGrid}>
              {cells.map((cell, idx) =>
                cell ? (
                  <button
                    key={cell.date}
                    type="button"
                    disabled={cell.disabled}
                    title={cell.reason}
                    className={`${styles.optionPickerDay} ${cell.disabled ? styles.optionPickerDayDisabled : ''}`}
                    onClick={() => {
                      onSelect({ date: cell.date, hebrewDate: cell.hebrewDate });
                      onClose();
                    }}
                  >
                    <span className={styles.optionPickerDayNum}>{new Date(cell.date + 'T12:00:00').getDate()}</span>
                    {cell.hebrewDate && <span className={styles.optionPickerDayHeb}>{cell.hebrewDate}</span>}
                  </button>
                ) : (
                  <span key={`empty-${idx}`} className={styles.optionPickerDayEmpty} />
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

interface OptionDatesBarProps {
  selectedDates: OptionDateItem[];
  onChange: (dates: OptionDateItem[]) => void;
  eventType: string;
}

const OptionDatesBar = ({ selectedDates, onChange, eventType }: OptionDatesBarProps) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualDate, setManualDate] = useState('');
  const [manualError, setManualError] = useState('');
  const [manualAdding, setManualAdding] = useState(false);
  const normalized = selectedDates.map(normalizeOptionDate);
  const canAdd = normalized.length < MAX_OPTION_DATES;
  const todayStr = formatDateLocal(new Date());

  const removeDate = (date: string) => {
    if (normalized.length <= 1) {
      alert('חייב להישאר לפחות תאריך אחד באופציה.');
      return;
    }
    onChange(normalized.filter(d => d.date !== date));
  };

  const addDate = (item: OptionDateItem) => {
    if (normalized.some(d => d.date === item.date)) return;
    onChange([...normalized, item]);
    setManualDate('');
    setManualError('');
  };

  const handleManualAdd = async () => {
    setManualError('');
    setManualAdding(true);
    const result = await resolveOptionDate(
      manualDate,
      eventType,
      normalized.map(d => d.date)
    );
    setManualAdding(false);
    if (!result.ok) {
      setManualError(result.error);
      return;
    }
    addDate(result.item);
  };

  return (
    <>
      <div className={styles.optionDatesBar}>
        <div className={styles.optionDatesBarHead}>
          <strong>תאריכי האופציה ({normalized.length}/{MAX_OPTION_DATES})</strong>
          <span className={styles.optionDatesBarHint}>ניתן לשמור עד 3 תאריכים חלופיים</span>
        </div>

        <div className={styles.optionDatesChips}>
          {normalized.map((d, i) => (
            <div key={d.date} className={styles.optionDateChip}>
              <span className={styles.optionDateChipMain}>
                <span className={styles.optionDateChipIndex}>תאריך {i + 1}</span>
                <span className={styles.optionDateChipGreg}>{formatDisplay(d.date)}</span>
                <span className={styles.optionDateChipDow}>יום {getDayOfWeek(d.date)}</span>
                {d.hebrewDate && <span className={styles.optionDateChipHeb}>{d.hebrewDate}</span>}
              </span>
              {normalized.length > 1 && (
                <button type="button" className={styles.optionDateChipRemove} onClick={() => removeDate(d.date)} aria-label="הסר תאריך">
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {canAdd ? (
          <div className={styles.optionDatesAddSection}>
            <div className={styles.optionDatesAddRow}>
              <button type="button" className={styles.optionAddDateBtn} onClick={() => setPickerOpen(true)}>
                + בחירה מלוח שנה
              </button>
              <span className={styles.optionDatesOr}>או</span>
              <input
                type="date"
                className={styles.optionManualInput}
                value={manualDate}
                min={todayStr}
                onChange={e => {
                  setManualDate(e.target.value);
                  setManualError('');
                }}
              />
              <button
                type="button"
                className={styles.optionManualAddBtn}
                onClick={handleManualAdd}
                disabled={!manualDate || manualAdding}
              >
                {manualAdding ? 'בודק...' : 'הוסף ידנית'}
              </button>
            </div>
            {manualError && <p className={styles.optionManualError}>{manualError}</p>}
          </div>
        ) : (
          <p className={styles.optionDatesMaxMsg}>נבחרו 3 תאריכים — מקסימום לאופציה.</p>
        )}
      </div>

      <OptionDatePickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={addDate}
        excludeDates={normalized.map(d => d.date)}
        eventType={eventType}
      />
    </>
  );
};

export default OptionDatesBar;
