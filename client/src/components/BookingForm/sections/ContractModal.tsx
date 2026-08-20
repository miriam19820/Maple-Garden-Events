import React, { useRef, useState, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { getSignatureDataUrl } from '../../../utils/signature';
import { openContractPdf } from '../../../utils/contractPrint';
import ContractTextViewer from './ContractTextViewer';
import modalStyles from './ContractModal.module.css';
import { useTranslation } from '../../../i18n/useTranslation';
import { secureFetch } from '../../../services/api';
import { API_URL } from '../../../config/api';
import { runUserAction } from '../../../utils/runUserAction';
import { isContractFullySigned } from '@shared/contract';

interface ContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  isOption: boolean;
  isWedding: boolean;
  eventType?: string | null;
  setContractSigned: (signed: boolean) => void;
  onSignaturesSaved?: (signatures: { a: string | null; b: string | null }) => void;
  contractText: string;
  onContractTextChange: (text: string) => void;
  bookingId?: string;
  styles?: Record<string, string>;
  savedSignatureA?: string | null;
  savedSignatureB?: string | null;
}

const SIGNATURE_SIZE = { width: 700, height: 200 };
const DUAL_SIGNATURE_SIZE = { width: 400, height: 160 };

type PadSide = 'A' | 'B';

function useSignaturePad(saved: string | null | undefined, isOpen: boolean, padGeneration: number) {
  const canvasRef = useRef<SignatureCanvas | null>(null);
  const latestRef = useRef<{ gen: number; data: string } | null>(null);

  useEffect(() => {
    if (!isOpen || !saved || !canvasRef.current) return;
    const timer = window.setTimeout(() => {
      canvasRef.current?.fromDataURL(saved);
      latestRef.current = { gen: padGeneration, data: saved };
    }, 50);
    return () => window.clearTimeout(timer);
  }, [isOpen, saved, padGeneration]);

  const capture = (): string | null => {
    const fromPad = getSignatureDataUrl(canvasRef);
    if (fromPad) {
      latestRef.current = { gen: padGeneration, data: fromPad };
      return fromPad;
    }
    const cached = latestRef.current;
    if (cached && cached.gen === padGeneration) return cached.data;
    return null;
  };

  const snapshotOnEnd = () => {
    const snap = getSignatureDataUrl(canvasRef);
    if (snap) latestRef.current = { gen: padGeneration, data: snap };
  };

  const clear = () => {
    canvasRef.current?.clear();
    latestRef.current = null;
  };

  return { canvasRef, capture, snapshotOnEnd, clear };
}

const ContractModal = ({
  isOpen,
  onClose,
  isOption,
  isWedding,
  eventType,
  setContractSigned,
  onSignaturesSaved,
  contractText,
  onContractTextChange,
  bookingId,
  savedSignatureA,
  savedSignatureB,
}: ContractModalProps) => {
  const { t, T } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [padGeneration, setPadGeneration] = useState(0);
  const [wasOpen, setWasOpen] = useState(isOpen);
  const [isSigning, setIsSigning] = useState(false);
  const [localA, setLocalA] = useState<string | null>(savedSignatureA || null);
  const [localB, setLocalB] = useState<string | null>(savedSignatureB || null);

  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setIsEditing(false);
      setDraftText('');
      setPadGeneration((g) => g + 1);
      setLocalA(savedSignatureA || null);
      setLocalB(savedSignatureB || null);
    }
  }

  const lockedA = !!localA;
  const lockedB = !!localB;
  const padA = useSignaturePad(lockedA ? null : localA, isOpen && !lockedA, padGeneration);
  const padB = useSignaturePad(lockedB ? null : localB, isOpen && !lockedB && isWedding, padGeneration);

  if (!isOpen) return null;

  const persistSignatures = async (nextA: string | null, nextB: string | null, fullySigned: boolean) => {
    if (!bookingId) return { ok: true, fullySigned };
    let ok = false;
    let signed = fullySigned;
    await runUserAction(
      async () => {
        const response = await secureFetch(`${API_URL}/bookings/${bookingId}/sign-and-send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientSignature: nextA || undefined,
            clientBSignature: nextB || undefined,
          }),
        });
        const resData = await response.json().catch(() => ({}));
        if (response.ok && resData.success) {
          signed = resData.fullySigned === true;
          ok = true;
          return;
        }
        throw new Error(
          t(T.BOOKING.CONTRACT.SIGN_SEND_ERROR, {
            detail: resData.message || `HTTP ${response.status}`,
          }),
        );
      },
      {
        tags: { source: 'ContractModal', action: 'signAndSend' },
        extra: { bookingId },
        fallbackMessage: t(T.BOOKING.CONTRACT.SIGN_NETWORK_ERROR),
        onError: (_err, msg) => alert(msg),
      },
    );
    return { ok, fullySigned: signed };
  };

  const handleConfirmSignature = async () => {
    if (isEditing) {
      alert(t(T.BOOKING.CONTRACT.SAVE_EDIT_BEFORE_SIGN));
      return;
    }

    const nextA = lockedA ? localA : (padA.capture() || localA);
    const nextB = isWedding ? (lockedB ? localB : (padB.capture() || localB)) : null;

    if (!nextA && !nextB) {
      alert(t(T.BOOKING.CONTRACT.SIGN_REQUIRED));
      return;
    }
    if (isWedding && !nextA && !nextB) {
      alert(t(T.BOOKING.CONTRACT.SIGN_REQUIRED));
      return;
    }
    if (!isWedding && !nextA) {
      alert(t(T.BOOKING.CONTRACT.SIGN_REQUIRED));
      return;
    }

    const fullySigned = isContractFullySigned({
      eventType,
      signatureA: nextA,
      signatureB: nextB,
    });

    if (isWedding && !nextA && nextB) {
      // Side B alone is allowed to save, but the contract is not fully signed yet.
    } else if (!isWedding && !nextA) {
      alert(t(T.BOOKING.CONTRACT.SIGN_REQUIRED));
      return;
    }

    setIsSigning(true);
    const result = await persistSignatures(nextA, nextB, fullySigned);
    setIsSigning(false);
    if (bookingId && !result.ok) return;

    setLocalA(nextA);
    setLocalB(nextB);
    onSignaturesSaved?.({ a: nextA, b: nextB });

    const done = bookingId ? result.fullySigned : fullySigned;
    if (done) {
      if (bookingId) alert(t(T.BOOKING.CONTRACT.SIGNED_AND_SENT));
      setContractSigned(true);
      onClose();
      return;
    }

    if (isWedding) {
      alert(t(T.BOOKING.CONTRACT.PARTIAL_SAVED));
    }
  };

  const startEditing = () => {
    setDraftText(contractText);
    setIsEditing(true);
  };

  const saveEditing = () => {
    onContractTextChange(draftText);
    setIsEditing(false);
  };

  const cancelEditing = () => {
    setDraftText(contractText);
    setIsEditing(false);
  };

  const handleClear = () => {
    if (!lockedA) {
      padA.clear();
      setLocalA(null);
    }
    if (isWedding && !lockedB) {
      padB.clear();
      setLocalB(null);
    }
  };

  const renderPad = (
    side: PadSide,
    locked: boolean,
    saved: string | null,
    pad: ReturnType<typeof useSignaturePad>,
  ) => {
    const size = isWedding ? DUAL_SIGNATURE_SIZE : SIGNATURE_SIZE;
    const title = isWedding
      ? (side === 'A' ? t(T.BOOKING.CONTRACT.SIGNATURE_SIDE_A) : t(T.BOOKING.CONTRACT.SIGNATURE_SIDE_B))
      : t(T.BOOKING.CONTRACT.SIGNATURE_TITLE);

    return (
      <div className={modalStyles.signatureSlot}>
        <h4>
          {title}
          {locked ? <span className={modalStyles.lockedBadge}>{t(T.BOOKING.CONTRACT.SIGNATURE_LOCKED)}</span> : null}
        </h4>
        {locked && saved ? (
          <div className={`${modalStyles.signatureBox} ${modalStyles.signatureBoxLocked}`}>
            <img src={saved} alt={title} className={modalStyles.lockedSignatureImg} />
          </div>
        ) : (
          <div className={modalStyles.signatureBox}>
            <SignatureCanvas
              key={`${side}-${padGeneration}`}
              ref={pad.canvasRef}
              penColor="#0f172a"
              onEnd={pad.snapshotOnEnd}
              canvasProps={{
                width: size.width,
                height: size.height,
                style: { cursor: 'crosshair', width: '100%', height: 'auto', display: 'block', touchAction: 'none' },
              }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={modalStyles.overlay}>
      <div className={modalStyles.modal}>
        <div className={modalStyles.header}>
          <h3>{isOption ? t(T.BOOKING.CONTRACT.TITLE_OPTION) : t(T.BOOKING.CONTRACT.TITLE_BOOKING)}</h3>
          <button type="button" onClick={onClose} className={`maple-close-btn ${modalStyles.headerClose}`} aria-label={t(T.BOOKING.CONTRACT.CLOSE)}>✕</button>
        </div>

        <div className={modalStyles.body}>
          <div className={modalStyles.contentWrap}>
            {isOption && !isEditing && (
              <div className={modalStyles.draftWatermark}>{t(T.BOOKING.CONTRACT.DRAFT_WATERMARK)}</div>
            )}

            <div className={modalStyles.toolbar}>
              <span className={modalStyles.toolbarTitle}>{t(T.BOOKING.CONTRACT.TEXT_TITLE)}</span>
              <div className={modalStyles.toolbarActions}>
                {bookingId && !isEditing && (
                  <button
                    type="button"
                    className="maple-btn maple-btn-secondary"
                    onClick={() => void openContractPdf(bookingId, t)}
                  >
                    {t(T.BOOKING.CONTRACT.VIEW_PDF)}
                  </button>
                )}
                {!isEditing ? (
                  <button type="button" onClick={startEditing} className={modalStyles.editBtn}>
                    {t(T.BOOKING.CONTRACT.EDIT_TEXT)}
                  </button>
                ) : (
                  <div className={modalStyles.editActions}>
                    <button type="button" onClick={saveEditing} className="maple-btn maple-btn-primary">
                      {t(T.COMMON.ACTIONS.SAVE)}
                    </button>
                    <button type="button" onClick={cancelEditing} className="maple-btn maple-btn-secondary">
                      {t(T.COMMON.ACTIONS.CANCEL)}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {isEditing ? (
              <textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                className={modalStyles.textarea}
              />
            ) : (
              <div className={modalStyles.textPanel}>
                {contractText ? (
                  <ContractTextViewer text={contractText} />
                ) : (
                  <span className={modalStyles.emptyMsg}>
                    {t(T.BOOKING.CONTRACT.EMPTY)}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className={modalStyles.disclaimer}>
            <p>{t(T.BOOKING.CONTRACT.DISCLAIMER)}</p>
          </div>

          <div className={`${modalStyles.signatureSection} ${isWedding ? modalStyles.signatureSectionDual : ''}`}>
            {renderPad('A', lockedA, localA, padA)}
            {isWedding ? renderPad('B', lockedB, localB, padB) : null}
          </div>

          <div className={modalStyles.actions}>
            <button
              type="button"
              onClick={handleClear}
              className="maple-btn maple-btn-danger"
              disabled={(!isWedding && lockedA) || (isWedding && lockedA && lockedB)}
            >
              {t(T.BOOKING.CONTRACT.CLEAR_SIGNATURE)}
            </button>

            <button
              type="button"
              onClick={handleConfirmSignature}
              disabled={isSigning}
              className={`maple-btn maple-btn-primary ${modalStyles.signBtn}`}
            >
              {isSigning ? t(T.BOOKING.CONTRACT.SIGNING_IN_PROGRESS) : t(T.BOOKING.CONTRACT.CONFIRM_SIGN)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContractModal;
