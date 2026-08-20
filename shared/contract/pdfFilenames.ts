/** Characters illegal in Windows / macOS / most email clients. */
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

const CONTRACT_TITLE = 'חוזה';
const PRODUCTION_TITLE = 'טופס הפקת אירוע';
const FALLBACK_EVENT_TYPE = 'אירוע';
const FALLBACK_DOCUMENT = 'מסמך';

export type PdfFilenameBooking = {
  eventType?: string | null;
  eventCode?: string | null;
  id?: string | null;
  clientAFullName?: string | null;
  clientBFullName?: string | null;
};

export function sanitizePdfFilename(name: string): string {
  const withoutExt = String(name || '').replace(/\.pdf$/i, '');
  const cleaned = withoutExt
    .replace(ILLEGAL_FILENAME_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 120)
    .trim();
  return `${cleaned || FALLBACK_DOCUMENT}.pdf`;
}

export function extractLastName(fullName?: string | null): string {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts[parts.length - 1] || '';
}

export function combineFamilyNames(
  clientAFullName?: string | null,
  clientBFullName?: string | null,
): string {
  const sideA = extractLastName(clientAFullName);
  const sideB = extractLastName(clientBFullName);
  if (sideA && sideB && sideA !== sideB) return `${sideA} ו${sideB}`;
  return sideA || sideB;
}

function eventTypeLabel(eventType?: string | null): string {
  return (eventType || '').trim() || FALLBACK_EVENT_TYPE;
}

function composeNamedPdf(title: string, booking: PdfFilenameBooking): string {
  const type = eventTypeLabel(booking.eventType);
  const families = combineFamilyNames(booking.clientAFullName, booking.clientBFullName);
  const raw = families ? `${title} ${type} ${families}` : `${title} ${type}`;
  return sanitizePdfFilename(raw);
}

export function buildContractPdfFilename(booking: PdfFilenameBooking): string {
  return composeNamedPdf(CONTRACT_TITLE, booking);
}

export function buildProductionPdfFilename(booking: PdfFilenameBooking): string {
  return composeNamedPdf(PRODUCTION_TITLE, booking);
}

function asciiFallbackName(prefix: string, booking: PdfFilenameBooking): string {
  const code = String(booking.eventCode || booking.id || 'document').replace(ILLEGAL_FILENAME_CHARS, '-');
  return sanitizePdfFilename(`${prefix}-${code}`);
}

export function contractAsciiFallback(booking: PdfFilenameBooking): string {
  return asciiFallbackName('contract', booking);
}

export function productionAsciiFallback(booking: PdfFilenameBooking): string {
  return asciiFallbackName('event-form', booking);
}

/** RFC 5987 Content-Disposition so Hebrew filenames survive latin1 HTTP headers. */
export function contentDispositionHeader(
  filename: string,
  disposition: 'inline' | 'attachment',
  asciiFallback: string,
): string {
  const utf8Name = sanitizePdfFilename(filename);
  const asciiName = sanitizePdfFilename(asciiFallback).replace(/[^\x20-\x7E]/g, '_') || 'document.pdf';
  return `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(utf8Name)}`;
}

export function filenameFromContentDisposition(
  header: string | null | undefined,
  fallback: string,
): string {
  if (!header) return fallback;
  const utf8 = /filename\*=(?:UTF-8''|utf-8'')([^;]+)/i.exec(header);
  if (utf8?.[1]) {
    try {
      return sanitizePdfFilename(decodeURIComponent(utf8[1].trim().replace(/^"+|"+$/g, '')));
    } catch {
      // fall through
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(header);
  if (quoted?.[1]) return sanitizePdfFilename(quoted[1]);
  const plain = /filename=([^;]+)/i.exec(header);
  if (plain?.[1]) return sanitizePdfFilename(plain[1].trim());
  return fallback;
}
