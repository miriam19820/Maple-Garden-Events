/**
 * Trigger: EventApproaching (§7 / Scenario D).
 *
 * ONE handler serves every "N days before the event, and X is still missing" reminder.
 * The day offsets and the requirement list are rule configuration, so adding
 * "music selection" or a new milestone means editing a rule row — not writing a Worker.
 *
 * The requirement checks mirror the ones the existing morning cron already uses
 * (utils/cronJobs.ts): tablecloth+napkin, final guest count, kashrut. Anything beyond
 * that list is an OPEN BUSINESS QUESTION (§49) — see docs/whatsapp/automation.md.
 */

import prisma from '../../../../config/prisma';
import { phoneNumberNormalizer } from '../../phone';
import { formatIlDate, queueRuleAction, readConfig } from '../helpers';
import {
  emptyResult,
  type AutomationHandler,
  type AutomationResult,
  type AutomationRuleRow,
  type ScheduledContext,
} from '../types';

/** Requirement id -> predicate over the booking's production form. */
export type EventFormLike = {
  tableclothId?: string | null;
  napkinId?: string | null;
  finalGuestCount?: number | null;
  kashrut?: string | null;
  seatingType?: string | null;
  centerpiece?: string | null;
  akumCode?: string | null;
} | null;

export const REQUIREMENT_CHECKS: Record<
  string,
  { label: string; isMissing: (form: EventFormLike) => boolean }
> = {
  // "Chair / table design" in the brief maps to this venue's tablecloth+napkin pair.
  tablecloth: {
    label: 'בחירת מפות ומפיות',
    isMissing: (form) => !form?.tableclothId || !form?.napkinId,
  },
  finalGuestCount: {
    label: 'מספר מנות סופי',
    isMissing: (form) => !form?.finalGuestCount,
  },
  kashrut: {
    label: 'בחירת כשרות',
    isMissing: (form) => !form?.kashrut,
  },
  seating: {
    label: 'סוג הושבה',
    isMissing: (form) => !form?.seatingType,
  },
  centerpiece: {
    label: 'עיצוב מרכז שולחן',
    isMissing: (form) => !form?.centerpiece,
  },
  music: {
    label: 'אישור אקו"ם / מוזיקה',
    isMissing: (form) => !form?.akumCode,
  },
  productionForm: {
    label: 'טופס הפקה',
    isMissing: (form) => !form,
  },
};

type Config = {
  /** Fire at these offsets before the event date. */
  daysBefore: number[];
  /** Which requirement ids to check. Empty = remind regardless of completeness. */
  requirements: string[];
  /** Send only when at least one requirement is missing. */
  onlyWhenMissing: boolean;
  maxBookingsPerRun: number;
};

const DEFAULTS: Config = {
  daysBefore: [30, 14, 7],
  requirements: ['tablecloth', 'finalGuestCount', 'kashrut'],
  onlyWhenMissing: true,
  maxBookingsPerRun: 200,
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export const eventApproachingHandler: AutomationHandler<'EventApproaching'> = {
  trigger: 'EventApproaching',
  description:
    'Daily scan: for each configured offset (e.g. 30/14/7 days before the event), remind customers whose production form is still missing the configured selections.',

  async execute(rule: AutomationRuleRow, context: ScheduledContext): Promise<AutomationResult> {
    const result = { ...emptyResult(), rulesEvaluated: 1 };
    const config = readConfig<Config>(rule.triggerConfiguration, DEFAULTS);
    const now = context.now ?? new Date();
    const today = startOfDay(now);

    if (!config.daysBefore?.length) return result;

    // Only the exact offset days are in scope, so a reminder fires once per milestone.
    const targetDates = config.daysBefore.map((days) => {
      const d = new Date(today);
      d.setDate(d.getDate() + days);
      return { days, start: d, end: new Date(d.getTime() + 24 * 60 * 60 * 1000) };
    });

    for (const target of targetDates) {
      const bookings = await prisma.booking.findMany({
        where: {
          tenantId: rule.tenantId,
          isOption: false,
          eventDate: {
            status: 'BOOKED',
            date: { gte: target.start, lt: target.end },
          },
        },
        include: { eventDate: true, eventForm: true },
        take: config.maxBookingsPerRun,
      });

      for (const booking of bookings) {
        const form = booking.eventForm as EventFormLike;

        const missing = (config.requirements ?? [])
          .map((id) => REQUIREMENT_CHECKS[id])
          .filter((check) => check && check.isMissing(form))
          .map((check) => check.label);

        if (config.onlyWhenMissing && missing.length === 0) {
          result.skipped += 1;
          continue;
        }

        const [phone] = phoneNumberNormalizer.normalizeMany(booking.clientAPhone);
        if (!phone) {
          result.skipped += 1;
          continue;
        }

        const queued = await queueRuleAction({
          rule,
          toPhone: phone,
          values: {
            customerName: booking.clientAFullName,
            eventCode: booking.eventCode,
            eventDate: formatIlDate(booking.eventDate?.date ?? null),
            daysBefore: target.days,
            missingItems: missing.join(', '),
            missingCount: missing.length,
          },
          bookingId: booking.id,
          // One reminder per booking per milestone, ever.
          dedupeKey: `rule:${rule.id}:approaching:${booking.id}:d${target.days}`,
        });
        queued ? (result.actionsQueued += 1) : (result.skipped += 1);
      }
    }

    return result;
  },
};
