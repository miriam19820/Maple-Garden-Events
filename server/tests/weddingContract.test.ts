import {
  hasRequiredWeddingClientDetails,
  isClientSideComplete,
  isContractFullySigned,
  isWeddingEventType,
  requiresDualSignatures,
} from '@maple/shared/contract';
import { resolvePersistedSignatures, syncContractFields } from '../src/utils/contractFields';

describe('wedding client details', () => {
  it('accepts a complete side A only', () => {
    expect(hasRequiredWeddingClientDetails({
      clientAFullName: 'ישראל ישראלי',
      clientAPhone: '0501234567',
      clientBFullName: '',
      clientBPhone: '',
    })).toBe(true);
  });

  it('accepts a complete side B only', () => {
    expect(hasRequiredWeddingClientDetails({
      clientAFullName: '',
      clientAPhone: '',
      clientBFullName: 'ישראלית ישראלי',
      clientBPhone: '0521234567',
    })).toBe(true);
  });

  it('rejects incomplete sides', () => {
    expect(hasRequiredWeddingClientDetails({
      clientAFullName: 'ישראל',
      clientAPhone: '050',
      clientBFullName: 'כלה',
      clientBPhone: '',
    })).toBe(false);
  });

  it('treats a side as complete only with name and phone', () => {
    expect(isClientSideComplete('שם מלא', '0501234567')).toBe(true);
    expect(isClientSideComplete('שם מלא', '05012')).toBe(false);
    expect(isClientSideComplete('א', '0501234567')).toBe(false);
  });
});

describe('dual signatures', () => {
  it('requires two signatures only for wedding events', () => {
    expect(isWeddingEventType('חתונה')).toBe(true);
    expect(requiresDualSignatures('חתונה')).toBe(true);
    expect(requiresDualSignatures('בר מצווה')).toBe(false);
    expect(isContractFullySigned({
      eventType: 'חתונה',
      signatureA: 'data:image/png;a',
      signatureB: null,
    })).toBe(false);
    expect(isContractFullySigned({
      eventType: 'חתונה',
      signatureA: 'data:image/png;a',
      signatureB: 'data:image/png;b',
    })).toBe(true);
    expect(isContractFullySigned({
      eventType: 'בר מצווה',
      signatureA: 'data:image/png;a',
      signatureB: null,
    })).toBe(true);
  });

  it('does not mark a wedding contract signed until both images exist', () => {
    const partial = syncContractFields(true, 'data:image/png;a', null, 'חתונה');
    expect(partial.isContractSigned).toBe(false);
    expect(partial.clientSignatureUrl).toBe('data:image/png;a');

    const full = syncContractFields(true, 'data:image/png;a', 'data:image/png;b', 'חתונה');
    expect(full.isContractSigned).toBe(true);

    const other = syncContractFields(true, 'data:image/png;a', null, 'בר מצווה');
    expect(other.isContractSigned).toBe(true);
  });

  it('saves one signature independently and keeps the other', () => {
    const merged = resolvePersistedSignatures({
      eventType: 'חתונה',
      contractSigned: true,
      incomingA: '',
      incomingB: 'data:image/png;b',
      existingA: 'data:image/png;a',
      existingB: null,
    });
    expect(merged.clientSignatureUrl).toBe('data:image/png;a');
    expect(merged.clientBSignatureUrl).toBe('data:image/png;b');
    expect(merged.isContractSigned).toBe(true);
  });
});
