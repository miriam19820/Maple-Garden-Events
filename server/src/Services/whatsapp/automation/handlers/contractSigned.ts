/**
 * Trigger: ContractSigned (§4 / Scenario A).
 *
 * "Signed" is NOT redefined here. It is `booking.isContractSigned`, which the existing
 * `syncContractFields` sets only when the contract flag AND every required signature
 * for that event type are present (utils/contractFields.ts). This handler re-reads that
 * flag rather than trusting the caller.
 */

import prisma from '../../../../config/prisma';
import { logger } from '../../../../utils/logger';
import { phoneNumberNormalizer } from '../../phone';
import { formatIlAmount, formatIlDate, queueRuleAction, readConfig } from '../helpers';
import { emptyResult, type AutomationHandler, type AutomationResult, type AutomationRuleRow, type ContractSignedContext } from '../types';

type Config = {
  /** Also attach the contract PDF, when the caller supplied one. */
  attachContractPdf: boolean;
  /** Notify clientB as well when a second phone exists. */
  includeSecondClient: boolean;
};

const DEFAULTS: Config = { attachContractPdf: true, includeSecondClient: false };

export const contractSignedHandler: AutomationHandler<'ContractSigned'> = {
  trigger: 'ContractSigned',
  description:
    'When a booking becomes fully signed (booking.isContractSigned), send the customer a confirmation template with the event details, optionally attaching the contract PDF.',

  async execute(rule: AutomationRuleRow, context: ContractSignedContext): Promise<AutomationResult> {
    const result = { ...emptyResult(), rulesEvaluated: 1 };
    const config = readConfig<Config>(rule.triggerConfiguration, DEFAULTS);

    const booking = await prisma.booking.findFirst({
      where: { id: context.bookingId, tenantId: rule.tenantId },
      include: { eventDate: true },
    });

    if (!booking) {
      result.skipped += 1;
      result.details?.push('booking-not-found-in-tenant');
      return result;
    }

    // Authoritative re-check — never fire on a caller's say-so.
    if (!booking.isContractSigned) {
      result.skipped += 1;
      result.details?.push('contract-not-fully-signed');
      return result;
    }

    const phones = config.includeSecondClient
      ? phoneNumberNormalizer.normalizeMany(booking.clientAPhone, booking.clientBPhone)
      : phoneNumberNormalizer.normalizeMany(booking.clientAPhone).slice(0, 1);

    if (phones.length === 0) {
      result.skipped += 1;
      result.details?.push('no-valid-phone');
      logger.warn('ContractSigned automation: booking has no usable phone number', {
        tenantId: rule.tenantId,
        bookingId: booking.id,
      });
      return result;
    }

    const values = {
      customerName: booking.clientAFullName,
      eventCode: booking.eventCode,
      eventDate: formatIlDate(booking.eventDate?.date ?? null),
      guestCount: booking.guestCount,
      totalPrice: formatIlAmount(booking.totalPrice),
      eventType: booking.eventType,
    };

    for (const phone of phones) {
      const queued = await queueRuleAction({
        rule,
        toPhone: phone,
        values,
        bookingId: booking.id,
        // One confirmation per booking per rule, forever — a re-save of the booking
        // cannot re-send it.
        dedupeKey: `rule:${rule.id}:contract-signed:${booking.id}:${phone}`,
      });
      if (queued) result.actionsQueued += 1;
      else result.skipped += 1;
    }

    if (config.attachContractPdf && context.contractPdfBase64) {
      // The PDF goes as a second, separate message so a template failure does not
      // block the document (and vice versa).
      const { queueWhatsAppMessage } = await import('../../send.service');
      for (const phone of phones) {
        try {
          await queueWhatsAppMessage({
            kind: 'document',
            tenantId: rule.tenantId,
            toPhone: phone,
            bookingId: booking.id,
            filename: context.contractFilename ?? `contract-${booking.eventCode}.pdf`,
            base64: context.contractPdfBase64,
            mimeType: 'application/pdf',
            dedupeKey: `rule:${rule.id}:contract-pdf:${booking.id}:${phone}`,
            requestedBy: `automation:${rule.name}`,
          });
          result.actionsQueued += 1;
        } catch (error) {
          result.skipped += 1;
          logger.warn('ContractSigned automation could not queue the contract PDF', {
            tenantId: rule.tenantId,
            bookingId: booking.id,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return result;
  },
};
