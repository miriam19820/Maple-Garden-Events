/**
 * Trigger: PaymentOverdue (§6 / Scenario C).
 *
 * The overdue RULE is not redefined here. It reuses the existing
 * `evaluateBookingPaymentStatus` from Services/paymentDeadlineService, which combines
 * the hall balance and the contract's payment-terms template. This handler only decides
 * who gets told and how.
 *
 * NOTE: the existing daily cron (utils/cronJobs.ts -> checkOverduePayments) already
 * sends manager alerts through utils/whatsapp.ts. This automation is OFF by default so
 * the two cannot double-notify; enable it only when migrating off the legacy path.
 * See docs/whatsapp/automation.md.
 */

import prisma from '../../../../config/prisma';
import { logger } from '../../../../utils/logger';
import { evaluateBookingPaymentStatus } from '../../../paymentDeadlineService';
import {
  findPaymentTemplate,
  getPaymentTemplatesFromSettings,
} from '../../../../utils/paymentTerms';
import { phoneNumberNormalizer } from '../../phone';
import {
  formatIlAmount,
  formatIlDate,
  queueRuleAction,
  readConfig,
  resolveManagerPhone,
} from '../helpers';
import {
  emptyResult,
  type AutomationHandler,
  type AutomationResult,
  type AutomationRuleRow,
  type ScheduledContext,
} from '../types';

type Config = {
  /** 'manager' | 'customer' | 'both' */
  notify: 'manager' | 'customer' | 'both';
  /** Only alert once the payment is at least this many days late. */
  minDaysOverdue: number;
  /** Cap the scan so one tick cannot run away. */
  maxBookingsPerRun: number;
};

const DEFAULTS: Config = { notify: 'manager', minDaysOverdue: 0, maxBookingsPerRun: 200 };

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

export const paymentOverdueHandler: AutomationHandler<'PaymentOverdue'> = {
  trigger: 'PaymentOverdue',
  description:
    'Daily scan for booked events whose contractual payment installments are overdue with a remaining balance; alerts the manager and/or the customer.',

  async execute(rule: AutomationRuleRow, context: ScheduledContext): Promise<AutomationResult> {
    const result = { ...emptyResult(), rulesEvaluated: 1 };
    const config = readConfig<Config>(rule.triggerConfiguration, DEFAULTS);
    const now = context.now ?? new Date();

    const settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
    const { templates, defaultTemplateId } = getPaymentTemplatesFromSettings(settings ?? undefined);

    const bookings = await prisma.booking.findMany({
      where: {
        tenantId: rule.tenantId,
        isOption: false,
        eventDate: { status: 'BOOKED' },
      },
      include: { eventDate: true, hallInvoices: true },
      take: config.maxBookingsPerRun,
    });

    const managerPhone = resolveManagerPhone(rule);

    for (const booking of bookings) {
      const template =
        findPaymentTemplate(templates, booking.paymentTemplateId) ??
        findPaymentTemplate(templates, defaultTemplateId) ??
        templates[0];
      if (!template) continue;

      const status = evaluateBookingPaymentStatus(booking, template, now);
      if (!status) continue;

      const missedDeadline =
        status.obligation.overdueInstallments.at(-1)?.dueDate ?? booking.paymentDeadline ?? null;
      const daysOverdue = missedDeadline ? daysBetween(missedDeadline, now) : 0;
      if (daysOverdue < config.minDaysOverdue) {
        result.skipped += 1;
        continue;
      }

      const values = {
        customerName: booking.clientAFullName,
        eventCode: booking.eventCode,
        eventDate: formatIlDate(booking.eventDate?.date ?? null),
        dueDate: formatIlDate(missedDeadline),
        expectedAmount: formatIlAmount(status.obligation.requiredByNow),
        paidAmount: formatIlAmount(status.balance.committedTotal),
        remainingAmount: formatIlAmount(status.balance.remaining),
        daysOverdue,
      };

      // The dedupe key includes the date, so an overdue payment produces at most one
      // alert per day per booking — not one per tick.
      const daySlot = now.toISOString().slice(0, 10);

      if (config.notify === 'manager' || config.notify === 'both') {
        if (!managerPhone) {
          result.skipped += 1;
          logger.warn('PaymentOverdue automation has no manager phone configured', {
            tenantId: rule.tenantId,
            ruleId: rule.id,
          });
        } else {
          const queued = await queueRuleAction({
            rule,
            toPhone: managerPhone,
            values,
            bookingId: booking.id,
            dedupeKey: `rule:${rule.id}:overdue-manager:${booking.id}:${daySlot}`,
          });
          queued ? (result.actionsQueued += 1) : (result.skipped += 1);
        }
      }

      if (config.notify === 'customer' || config.notify === 'both') {
        const [customerPhone] = phoneNumberNormalizer.normalizeMany(booking.clientAPhone);
        if (!customerPhone) {
          result.skipped += 1;
        } else {
          const queued = await queueRuleAction({
            rule,
            toPhone: customerPhone,
            values,
            bookingId: booking.id,
            dedupeKey: `rule:${rule.id}:overdue-customer:${booking.id}:${daySlot}`,
          });
          queued ? (result.actionsQueued += 1) : (result.skipped += 1);
        }
      }
    }

    return result;
  },
};
