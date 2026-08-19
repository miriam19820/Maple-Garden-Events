import { API_URL } from '../config/api';
import { secureFetch } from '../services/api';
import { T, type TranslationKey } from '@shared/i18n';
import { fetchContractPdf, openContractPdf } from './contractPrint';

type TranslateFn = (key: TranslationKey) => string;

async function parseApiError(response: Response, t: TranslateFn): Promise<string> {
  const err = await response.json().catch(() => ({}));
  return (err as { message?: string }).message || t(T.ARCHIVE.DOCUMENTS_ERROR);
}

export function getEventFormPdfUrl(bookingId: string): string {
  return `${API_URL}/event-forms/${bookingId}/pdf`;
}

export async function fetchEventFormPdf(bookingId: string, t: TranslateFn): Promise<Blob> {
  const response = await secureFetch(getEventFormPdfUrl(bookingId), { credentials: 'include' });
  const contentType = response.headers.get('Content-Type') || '';

  if (!response.ok) {
    throw new Error(await parseApiError(response, t));
  }

  if (!contentType.includes('application/pdf')) {
    throw new Error(await parseApiError(response, t));
  }

  return response.blob();
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function openBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function viewContractPdf(bookingId: string, t: TranslateFn): Promise<void> {
  await openContractPdf(bookingId, t);
}

export async function downloadContractPdf(
  bookingId: string,
  t: TranslateFn,
  filename: string,
): Promise<void> {
  try {
    const blob = await fetchContractPdf(bookingId, t);
    triggerDownload(blob, filename);
  } catch (e) {
    alert(e instanceof Error ? e.message : t(T.ARCHIVE.DOCUMENTS_ERROR));
  }
}

export async function viewProductionPdf(bookingId: string, t: TranslateFn): Promise<void> {
  try {
    const blob = await fetchEventFormPdf(bookingId, t);
    openBlob(blob);
  } catch (e) {
    alert(e instanceof Error ? e.message : t(T.ARCHIVE.DOCUMENTS_ERROR));
  }
}

export async function downloadProductionPdf(
  bookingId: string,
  t: TranslateFn,
  filename: string,
): Promise<void> {
  try {
    const blob = await fetchEventFormPdf(bookingId, t);
    triggerDownload(blob, filename);
  } catch (e) {
    alert(e instanceof Error ? e.message : t(T.ARCHIVE.DOCUMENTS_ERROR));
  }
}
