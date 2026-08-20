import { DEFAULT_EVENT_TYPE } from '../i18n/bookingLookups';

export function isWeddingEventType(eventType?: string | null): boolean {
  return (eventType || '').trim() === DEFAULT_EVENT_TYPE;
}

export function requiresDualSignatures(eventType?: string | null): boolean {
  return isWeddingEventType(eventType);
}

export function isClientSideComplete(
  name?: string | null,
  phone?: string | null,
): boolean {
  return (name || '').trim().length >= 2 && (phone || '').trim().length >= 9;
}

export function hasRequiredWeddingClientDetails(input: {
  clientAFullName?: string | null;
  clientAPhone?: string | null;
  clientBFullName?: string | null;
  clientBPhone?: string | null;
}): boolean {
  return (
    isClientSideComplete(input.clientAFullName, input.clientAPhone)
    || isClientSideComplete(input.clientBFullName, input.clientBPhone)
  );
}

export function isContractFullySigned(input: {
  eventType?: string | null;
  signatureA?: string | null;
  signatureB?: string | null;
}): boolean {
  const hasA = !!(input.signatureA || '').trim();
  if (!requiresDualSignatures(input.eventType)) return hasA;
  return hasA && !!(input.signatureB || '').trim();
}
