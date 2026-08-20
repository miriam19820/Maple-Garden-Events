import {
  isContractFullySigned,
  requiresDualSignatures,
} from '@maple/shared/contract';

export type ContractFieldValues = {
  isContractSigned: boolean;
  clientSignatureUrl: string | null;
  clientBSignatureUrl: string | null;
};

function trimSignature(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

/** Keep isContractSigned in sync with the required signature image(s) for the event type. */
export function syncContractFields(
  contractSigned: boolean | undefined | null,
  signatureA: string | null | undefined,
  signatureB?: string | null,
  eventType?: string | null,
): ContractFieldValues {
  const urlA = trimSignature(signatureA);
  const urlB = trimSignature(signatureB);
  const fullySigned = isContractFullySigned({
    eventType,
    signatureA: urlA,
    signatureB: urlB,
  });
  return {
    isContractSigned: !!(contractSigned && fullySigned),
    clientSignatureUrl: urlA,
    clientBSignatureUrl: urlB,
  };
}

/**
 * Merge incoming signature payloads with stored values.
 * Empty incoming strings preserve the existing image unless the contract is being unsigned.
 */
export function resolvePersistedSignatures(input: {
  eventType?: string | null;
  contractSigned?: boolean | null;
  incomingA?: unknown;
  incomingB?: unknown;
  existingA?: string | null;
  existingB?: string | null;
}): ContractFieldValues {
  const unsign = input.contractSigned === false;
  const signatureA = pickSignature(input.incomingA, input.existingA, unsign);
  const signatureB = pickSignature(input.incomingB, input.existingB, unsign);
  return syncContractFields(input.contractSigned, signatureA, signatureB, input.eventType);
}

function pickSignature(
  incoming: unknown,
  existing: string | null | undefined,
  unsign: boolean,
): string | null {
  if (typeof incoming === 'string' && incoming.trim()) {
    return incoming.trim();
  }
  if (unsign) return null;
  return trimSignature(existing);
}

export function hasStoredContractSignature(
  isContractSigned: boolean | undefined | null,
  clientSignatureUrl: string | null | undefined,
  clientBSignatureUrl?: string | null,
  eventType?: string | null,
): boolean {
  return !!(
    isContractSigned
    && isContractFullySigned({
      eventType,
      signatureA: clientSignatureUrl,
      signatureB: clientBSignatureUrl,
    })
  );
}

export { requiresDualSignatures, isContractFullySigned };
