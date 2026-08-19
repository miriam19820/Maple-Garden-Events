import { useTranslation } from '../../i18n/useTranslation';
import { Button } from '../ui';
import {
  downloadContractPdf,
  downloadProductionPdf,
  viewContractPdf,
  viewProductionPdf,
} from '../../utils/eventDocuments';
import styles from './EventDocuments.module.css';

interface EventDocumentsProps {
  bookingId: string;
  eventCode?: string;
  clientName?: string;
  hasContract: boolean;
  hasProductionForm: boolean;
}

export function EventDocuments({
  bookingId,
  eventCode,
  clientName,
  hasContract,
  hasProductionForm,
}: EventDocumentsProps) {
  const { t, T } = useTranslation();
  const slug = eventCode || clientName || bookingId;

  return (
    <section className={styles.panel} aria-labelledby="event-documents-title">
      <h3 id="event-documents-title" className={styles.title}>
        {t(T.ARCHIVE.DOCUMENTS_TITLE)}
      </h3>
      <p className={styles.hint}>{t(T.ARCHIVE.DOCUMENTS_HINT)}</p>
      <div className={styles.actions}>
        <Button
          variant="primary"
          disabled={!hasContract}
          title={hasContract ? t(T.ARCHIVE.VIEW_CONTRACT) : t(T.ARCHIVE.NO_CONTRACT)}
          onClick={() => void viewContractPdf(bookingId, t)}
        >
          {t(T.ARCHIVE.VIEW_CONTRACT)}
        </Button>
        <Button
          variant="secondary"
          disabled={!hasContract}
          title={hasContract ? t(T.ARCHIVE.DOWNLOAD_CONTRACT) : t(T.ARCHIVE.NO_CONTRACT)}
          onClick={() => void downloadContractPdf(bookingId, t, `contract-${slug}.pdf`)}
        >
          {t(T.ARCHIVE.DOWNLOAD_CONTRACT)}
        </Button>
        <Button
          variant="primary"
          disabled={!hasProductionForm}
          title={hasProductionForm ? t(T.ARCHIVE.VIEW_PRODUCTION) : t(T.ARCHIVE.NO_PRODUCTION)}
          onClick={() => void viewProductionPdf(bookingId, t)}
        >
          {t(T.ARCHIVE.VIEW_PRODUCTION)}
        </Button>
        <Button
          variant="secondary"
          disabled={!hasProductionForm}
          title={hasProductionForm ? t(T.ARCHIVE.DOWNLOAD_PRODUCTION) : t(T.ARCHIVE.NO_PRODUCTION)}
          onClick={() =>
            void downloadProductionPdf(bookingId, t, `production-form-${slug}.pdf`)
          }
        >
          {t(T.ARCHIVE.DOWNLOAD_PRODUCTION)}
        </Button>
      </div>
    </section>
  );
}
