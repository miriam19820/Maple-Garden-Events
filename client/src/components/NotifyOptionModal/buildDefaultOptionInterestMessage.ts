import { formatDate } from '@shared/i18n/formatters';

export function buildDefaultOptionInterestMessage(
  translate: (key: string, params?: Record<string, string | number>) => string,
  defaultKey: string,
  clientName: string,
  eventDateStr: string,
  locale: string,
): string {
  const dateDisplay = eventDateStr.includes('-')
    ? formatDate(eventDateStr, locale as 'he' | 'en')
    : formatDate(new Date(eventDateStr), locale as 'he' | 'en');
  return translate(defaultKey, { clientName, dateStr: dateDisplay });
}
