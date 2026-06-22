import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import EventCheckInBoard, {
  type CheckInFormData,
  type ReserveTableRow,
} from './EventCheckInBoard';
import styles from './LiveEvent.module.css';

interface EventCheckInModalProps {
  bookingId: string;
  dateDisplay: string;
  readOnly?: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

function normalizeReserveTables(raw: unknown): ReserveTableRow[] {
  const arr = Array.isArray(raw) ? raw : [];
  const byNumber = new Map<number, ReserveTableRow>();

  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const number = Number(row.number);
    if (!number) continue;
    byNumber.set(number, {
      number,
      value: String(row.value ?? (row.confirmed ? '✓' : '')),
    });
  }

  return [1, 2, 3, 4, 5].map((n) => byNumber.get(n) ?? { number: n, value: '' });
}

function splitSpecialAdditions(text: string): { line1: string; line2: string } {
  const parts = text.split('\n');
  return { line1: parts[0] ?? '', line2: parts[1] ?? '' };
}

function toFormData(checkIn: Record<string, unknown>): CheckInFormData {
  const special = splitSpecialAdditions(String(checkIn.specialAdditions || ''));
  return {
    familiesLabel: String(checkIn.familiesLabel || ''),
    orderedPortions:
      checkIn.orderedPortions != null ? Number(checkIn.orderedPortions) : '',
    entertainerPortions:
      checkIn.entertainerPortions != null ? Number(checkIn.entertainerPortions) : '',
    reservePortions:
      checkIn.reservePortions != null ? Number(checkIn.reservePortions) : '',
    reserveTables: normalizeReserveTables(checkIn.reserveTables),
    specialAdditionLine1: special.line1,
    specialAdditionLine2: special.line2,
    customerSignature: (checkIn.customerSignature as string | null) || null,
  };
}

const EventCheckInModal: React.FC<EventCheckInModalProps> = ({
  bookingId,
  dateDisplay,
  readOnly = false,
  onClose,
  onSaved,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<CheckInFormData | null>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetch(`http://localhost:5000/api/check-in/${bookingId}`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data?.checkIn) {
          setFormData(toFormData(res.data.checkIn));
        } else {
          setError(res.error || 'שגיאה בטעינת הטופס');
        }
      })
      .catch(() => {
        if (!cancelled) setError('שגיאת תקשורת');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const handleSave = async (data: CheckInFormData) => {
    const specialAdditions = [data.specialAdditionLine1, data.specialAdditionLine2]
      .filter(Boolean)
      .join('\n');

    const payload = {
      familiesLabel: data.familiesLabel,
      orderedPortions: data.orderedPortions === '' ? null : data.orderedPortions,
      entertainerPortions: data.entertainerPortions === '' ? null : data.entertainerPortions,
      reservePortions: data.reservePortions === '' ? null : data.reservePortions,
      reserveTables: data.reserveTables,
      specialAdditions,
      customerSignature: data.customerSignature,
    };

    const response = await fetch(`http://localhost:5000/api/check-in/${bookingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const res = await response.json();
    if (response.ok && res.success) {
      alert('טופס קבלת האולם נשמר בהצלחה');
      onSaved?.();
      onClose();
    } else {
      alert(res.error || 'שגיאה בשמירה');
    }
  };

  return createPortal(
    <div className={styles.checkInModalOverlay} onClick={onClose}>
      <div className={styles.checkInModalBox} onClick={(e) => e.stopPropagation()}>
        <div className={styles.checkInModalHeader}>
          <h2>טופס קבלת אולם{readOnly ? ' (צפייה בלבד)' : ''}</h2>
          <button type="button" className={styles.checkInModalClose} onClick={onClose}>
            ✕
          </button>
        </div>

        {loading && <div className={styles.checkInLoading}>טוען טופס...</div>}
        {error && <div className={styles.checkInError}>{error}</div>}
        {!loading && !error && formData && (
          <EventCheckInBoard
            dateDisplay={dateDisplay}
            initialData={formData}
            readOnly={readOnly}
            onSave={handleSave}
            onCancel={onClose}
          />
        )}
      </div>
    </div>,
    document.body
  );
};

export default EventCheckInModal;
