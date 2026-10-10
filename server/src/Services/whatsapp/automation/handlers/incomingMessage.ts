/**
 * Trigger: IncomingMessage (§8, §9, §24).
 *
 * Forwards a new customer message to the manager and, optionally, sends a first-touch
 * auto-reply to unknown numbers (the lead-capture seam of Scenario F).
 *
 * The auto-reply text is rule configuration — no bot logic and no business copy here.
 * The conversational lead flow itself is deliberately NOT implemented (see
 * docs/whatsapp/automation.md, "Not implemented").
 */

import prisma from '../../../../config/prisma';
import { queueWhatsAppMessage } from '../../send.service';
import { logger } from '../../../../utils/logger';
import { queueRuleAction, readConfig, renderTemplateText, resolveManagerPhone } from '../helpers';
import {
  emptyResult,
  type AutomationHandler,
  type AutomationResult,
  type AutomationRuleRow,
  type IncomingMessageContext,
} from '../types';

type Config = {
  notifyManager: boolean;
  /** Auto-reply to numbers with no matching booking. */
  autoReplyToUnknown: boolean;
  /** Free-form auto-reply body. Only deliverable inside the 24h window (always true here). */
  autoReplyBody?: string;
  /** Skip the auto-reply if we already sent one to this conversation. */
  autoReplyOncePerConversation: boolean;
};

const DEFAULTS: Config = {
  notifyManager: true,
  autoReplyToUnknown: false,
  autoReplyOncePerConversation: true,
};

export const incomingMessageHandler: AutomationHandler<'IncomingMessage'> = {
  trigger: 'IncomingMessage',
  description:
    'On a new inbound customer message: notify the manager, and optionally auto-reply to numbers that do not match an existing booking.',

  async execute(rule: AutomationRuleRow, context: IncomingMessageContext): Promise<AutomationResult> {
    const result = { ...emptyResult(), rulesEvaluated: 1 };
    const config = readConfig<Config>(rule.triggerConfiguration, DEFAULTS);

    const booking = context.bookingId
      ? await prisma.booking.findFirst({
          where: { id: context.bookingId, tenantId: rule.tenantId },
          include: { eventDate: true },
        })
      : null;

    const values = {
      fromPhone: context.fromPhone,
      profileName: context.profileName ?? '',
      messageType: context.messageType,
      // Message CONTENT is only interpolated into the manager forward, never logged (§44).
      messageText: context.text ?? '',
      customerName: booking?.clientAFullName ?? context.profileName ?? '',
      eventCode: booking?.eventCode ?? '',
      isKnownCustomer: context.isKnownCustomer,
    };

    if (config.notifyManager) {
      const managerPhone = resolveManagerPhone(rule);
      if (!managerPhone) {
        result.skipped += 1;
        logger.warn('IncomingMessage automation has no manager phone configured', {
          tenantId: rule.tenantId,
          ruleId: rule.id,
        });
      } else {
        const queued = await queueRuleAction({
          rule,
          toPhone: managerPhone,
          values,
          bookingId: context.bookingId,
          // Keyed on the inbound wamid so a webhook redelivery can never forward twice.
          dedupeKey: `rule:${rule.id}:inbound-notify:${context.externalMessageId}`,
        });
        queued ? (result.actionsQueued += 1) : (result.skipped += 1);
      }
    }

    if (config.autoReplyToUnknown && !context.isKnownCustomer && config.autoReplyBody) {
      if (config.autoReplyOncePerConversation) {
        const alreadyReplied = await prisma.whatsAppMessage.count({
          where: {
            tenantId: rule.tenantId,
            conversationId: context.conversationId,
            direction: 'Outbound',
          },
        });
        if (alreadyReplied > 0) {
          result.skipped += 1;
          return result;
        }
      }

      try {
        // An inbound message just arrived, so the 24h window is open — free-form is legal.
        await queueWhatsAppMessage({
          kind: 'text',
          tenantId: rule.tenantId,
          toPhone: context.fromPhone,
          bookingId: context.bookingId,
          body: renderTemplateText(config.autoReplyBody, values),
          dedupeKey: `rule:${rule.id}:auto-reply:${context.conversationId}`,
          requestedBy: `automation:${rule.name}`,
        });
        result.actionsQueued += 1;
      } catch (error) {
        result.skipped += 1;
        logger.warn('IncomingMessage auto-reply could not be queued', {
          tenantId: rule.tenantId,
          ruleId: rule.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  },
};
