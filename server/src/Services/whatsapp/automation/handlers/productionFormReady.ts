/**
 * Trigger: ProductionFormReady (§5 / Scenario B — "Send via WhatsApp" on the
 * event production screen).
 *
 * Caller-driven rather than scheduled: the API hands over an already-generated
 * document, this handler validates the recipient and queues it.
 */

import prisma from '../../../../config/prisma';
import { logger } from '../../../../utils/logger';
import { phoneNumberNormalizer } from '../../phone';
import { queueWhatsAppMessage } from '../../send.service';
import { formatIlDate, queueRuleAction, readConfig } from '../helpers';
import {
  emptyResult,
  type AutomationHandler,
  type AutomationResult,
  type AutomationRuleRow,
  type ProductionFormReadyContext,
} from '../types';

type Config = {
  /** Send an accompanying template before the document. */
  sendCoverMessage: boolean;
  includeSecondClient: boolean;
};

const DEFAULTS: Config = { sendCoverMessage: true, includeSecondClient: false };

export const productionFormReadyHandler: AutomationHandler<'ProductionFormReady'> = {
  trigger: 'ProductionFormReady',
  description:
    'Send the final event production document to the customer over WhatsApp, optionally preceded by a cover template.',

  async execute(
    rule: AutomationRuleRow,
    context: ProductionFormReadyContext,
  ): Promise<AutomationResult> {
    const result = { ...emptyResult(), rulesEvaluated: 1 };
    const config = readConfig<Config>(rule.triggerConfiguration, DEFAULTS);

    const booking = await prisma.booking.findFirst({
      where: { id: context.bookingId, tenantId: rule.tenantId },
      include: { eventDate: true },
    });
    if (!booking) {
      result.skipped += 1;
      return result;
    }

    const phones = config.includeSecondClient
      ? phoneNumberNormalizer.normalizeMany(booking.clientAPhone, booking.clientBPhone)
      : phoneNumberNormalizer.normalizeMany(booking.clientAPhone).slice(0, 1);

    if (phones.length === 0) {
      result.skipped += 1;
      return result;
    }

    const values = {
      customerName: booking.clientAFullName,
      eventCode: booking.eventCode,
      eventDate: formatIlDate(booking.eventDate?.date ?? null),
      guestCount: booking.guestCount,
    };

    const filename = context.filename ?? `production-${booking.eventCode}.pdf`;
    // Version the dedupe key by document content, so re-sending an UPDATED form works
    // while an accidental double-click does not send twice.
    const revision = context.documentBase64
      ? String(context.documentBase64.length)
      : new Date().toISOString().slice(0, 10);

    for (const phone of phones) {
      if (config.sendCoverMessage) {
        const queued = await queueRuleAction({
          rule,
          toPhone: phone,
          values,
          bookingId: booking.id,
          dedupeKey: `rule:${rule.id}:production-cover:${booking.id}:${revision}:${phone}`,
        });
        queued ? (result.actionsQueued += 1) : (result.skipped += 1);
      }

      if (!context.documentBase64) {
        result.skipped += 1;
        continue;
      }

      try {
        await queueWhatsAppMessage({
          kind: 'document',
          tenantId: rule.tenantId,
          toPhone: phone,
          bookingId: booking.id,
          filename,
          base64: context.documentBase64,
          mimeType: 'application/pdf',
          dedupeKey: `rule:${rule.id}:production-doc:${booking.id}:${revision}:${phone}`,
          requestedBy: context.requestedBy ?? `automation:${rule.name}`,
        });
        result.actionsQueued += 1;
      } catch (error) {
        result.skipped += 1;
        logger.warn('ProductionFormReady automation could not queue the document', {
          tenantId: rule.tenantId,
          bookingId: booking.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  },
};
