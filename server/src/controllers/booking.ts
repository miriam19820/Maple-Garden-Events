import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { sendBumpEmail, sendOptionInterestEmail } from '../utils/mailer';
import { sendBumpWhatsApp, sendOptionInterestWhatsApp } from '../utils/whatsapp';
import { catchAsync } from '../middlewares/errorHandler';
import { AuthRequest } from '../middlewares/auth';
import { generateEventFormPDF } from '../utils/pdfGenerator';
import { getContractText, resolveContractWithPaymentTerms, resolveDefaultPaymentTermsText } from '../utils/getContractText';
import { getPaymentTemplatesFromSettings } from '../utils/paymentTerms';
import { sendPDFToClient } from '../Services/emailService';
import {
  emitBookingUpdated,
  emitDateUpdated,
  emitDateUpdatedMany,
} from '../utils/realtime';
import {
  normalizeTimeSlot,
  formatStoredTimeOfDay,
  getTakenSlots,
  SLOT_LABELS,
  validateSlotOnDate,
  parseDateLocal,
  getBookableSlotsForDate,
  type TimeSlot,
} from '../utils/timeSlot';
import {
  allocateEventCode,
  convertOptionCodeToEventCode,
  peekNextEventCodes,
  type EventCodePrefix,
} from '../utils/eventCode';
import { isHallOnlyBooking, HALL_ONLY_EVENT_TYPE } from '../validators/booking.validator';
import { neonTransactionOptions, withDbRetry } from '../utils/dbRetry';

function canEditBookingDate(eventDate: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDay = new Date(eventDate);
  eventDay.setHours(0, 0, 0, 0);
  return today < eventDay;
}

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function releaseOptionDateInTx(tx: TxClient, dateId: string) {
  await tx.booking.deleteMany({ where: { calendarDateId: dateId } });
  await tx.eventDate.update({
    where: { id: dateId },
    data: {
      status: 'AVAILABLE',
      optionExpiresAt: null,
      lockedBy: null,
      clientName: null,
      clientPhone: null,
      clientEmail: null,
    },
  });
}

function hasOptionBookings(bookings: { isOption?: boolean }[]): boolean {
  return bookings.some((b) => b.isOption === true);
}

function slotConflictMessage(
  slot: TimeSlot,
  bookings: { isOption?: boolean; timeOfDay?: string | null }[],
): string {
  const optionHeld = bookings.some(
    (b) => b.isOption && normalizeTimeSlot(b.timeOfDay) === slot,
  );
  if (optionHeld) {
    return `משבצת ${SLOT_LABELS[slot]} תפוסה על ידי אופציה. לחצי "סגירת אירוע במקום האופציה" בלוח השנה.`;
  }
  return `כבר קיים אירוע ב${SLOT_LABELS[slot]} בתאריך זה.`;
}

function validateHallRentalPriceInput(data: { eventType?: string; hallRentalPrice?: unknown }): string | null {
  if (!isHallOnlyBooking(data)) return null;
  const raw = data.hallRentalPrice;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return 'יש להזין מחיר השכרת אולם';
  }
  const price = Number(raw);
  if (!Number.isFinite(price)) return 'מחיר השכרת אולם חייב להיות מספר תקין';
  if (price <= 0) return 'מחיר השכרת אולם חייב להיות גדול מ-0';
  return null;
}

function extractPriceBreakdown(
  data: {
    eventType?: string;
    calculatedTotals?: {
      baseTotal?: number;
      hallExtrasTotal?: number;
      externalExtrasTotal?: number;
      extrasTotal?: number;
      finalTotal?: number;
    };
    guestCount?: unknown;
    finalPricePortion?: unknown;
    hallRentalPrice?: unknown;
  },
  liveAdditionsTotal = 0,
) {
  const totals = data.calculatedTotals;
  if (totals?.baseTotal !== undefined) {
    const basePrice = Number(totals.baseTotal) || 0;
    const extrasPrice = Number(totals.hallExtrasTotal ?? totals.extrasTotal) || 0;
    const externalExtrasPrice = Number(totals.externalExtrasTotal) || 0;
    return {
      basePrice,
      extrasPrice,
      externalExtrasPrice,
      liveAdditionsTotal,
      totalPrice: basePrice + extrasPrice + externalExtrasPrice + liveAdditionsTotal,
    };
  }
  if (totals?.finalTotal !== undefined) {
    const totalPrice = Number(totals.finalTotal) + liveAdditionsTotal;
    return { basePrice: totalPrice, extrasPrice: 0, externalExtrasPrice: 0, liveAdditionsTotal, totalPrice };
  }
  let fallback = 0;
  if (isHallOnlyBooking(data)) {
    fallback = Number(data.hallRentalPrice) || 0;
  } else {
    fallback = (Number(data.guestCount) || 0) * (Number(data.finalPricePortion) || 0);
  }
  return { basePrice: fallback, extrasPrice: 0, externalExtrasPrice: 0, liveAdditionsTotal, totalPrice: fallback + liveAdditionsTotal };
}

export const createBooking = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = req.body;
  const isManager = req.user?.role === 'manager'; 
  const currentUserName = req.user?.name || "נציג מערכת";
  let datesToProcess: any[] = [];
  
  if (data.allSelectedDates && data.allSelectedDates.length > 0) {
    datesToProcess = data.allSelectedDates;
  } else if (data.calendarDateId) {
    datesToProcess = [data.calendarDateId];
  }

  if (datesToProcess.length === 0) {
    return res.status(400).json({ success: false, message: 'לא נבחרו תאריכים לאירוע.' });
  }

  const isOption = data.isOption === true || datesToProcess.length > 1;

  if (!isOption) {
    const hallPriceError = validateHallRentalPriceInput(data);
    if (hallPriceError) {
      return res.status(400).json({ success: false, message: hallPriceError });
    }
  }
  const newStatus = isOption ? 'OPTION' : 'BOOKED';

  let expiryDate: Date | null = null;
  if (newStatus === 'OPTION') {
    const hoursToAdd = data.optionDurationHours ? Number(data.optionDurationHours) : 48;
    expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + hoursToAdd);
  }

  // חישוב מחירים מפוצלים: בסיס / תוספות / סה"כ
  const prices = extractPriceBreakdown(data, 0);

  const clientAPhoneCombined = data.clientAPhone2 ? `${data.clientAPhone} | נוסף: ${data.clientAPhone2}` : data.clientAPhone;
  const clientAAddressCombined = data.clientACity ? `${data.clientACity}, ${data.clientAAddress}` : data.clientAAddress;
  const clientBPhoneCombined = data.clientBPhone2 ? `${data.clientBPhone} | נוסף: ${data.clientBPhone2}` : data.clientBPhone;
  const clientBAddressCombined = data.clientBCity ? `${data.clientBCity}, ${data.clientBAddress}` : data.clientBAddress;

  const resolvedContractText = data.contractText?.trim()
    || await resolveContractWithPaymentTerms({
      paymentTermsText: data.paymentTermsText,
      total: prices.totalPrice,
      eventDate: typeof datesToProcess[0] === 'object' ? datesToProcess[0]?.date : datesToProcess[0],
    });
  const paymentTermsText = data.paymentTermsText?.trim()
    || await resolveDefaultPaymentTermsText(
      prices.totalPrice,
      typeof datesToProcess[0] === 'object' ? datesToProcess[0]?.date : datesToProcess[0],
    );
  const overrideOptionDateId: string | undefined = data.overrideOptionDateId;

  let createdBookings: any[] = [];
  let eventsToEmit: { dateId: string, status: string }[] = [];

  await withDbRetry(() =>
    prisma.$transaction(async (tx) => {
    createdBookings = [];
    eventsToEmit = [];

    for (const dateItem of datesToProcess) {
      const dateString = typeof dateItem === 'object' && dateItem !== null ? dateItem.date : dateItem;
      const possibleDate = new Date(dateString);
      
      if (isNaN(possibleDate.getTime())) continue;

      let eventDate = await tx.eventDate.findFirst({
        where: { date: possibleDate },
        include: { bookings: true },
      });

      const optionBookingsOnDate = hasOptionBookings(eventDate?.bookings ?? []);
      const isOverrideTarget =
        !isOption
        && !!overrideOptionDateId
        && eventDate?.id === overrideOptionDateId
        && (eventDate.status === 'OPTION' || optionBookingsOnDate);

      if (
        !isOption
        && overrideOptionDateId
        && eventDate?.id === overrideOptionDateId
        && !optionBookingsOnDate
        && eventDate.status !== 'OPTION'
      ) {
        const err: any = new Error('האופציה כבר שוחררה או הומרה — יש לרענן את הלוח שנה.');
        err.statusCode = 409;
        throw err;
      }

      if (isOverrideTarget && eventDate) {
        await releaseOptionDateInTx(tx, eventDate.id);
        eventDate = await tx.eventDate.findUnique({
          where: { id: eventDate.id },
          include: { bookings: true },
        });
        if (!eventDate) {
          const err: any = new Error('תאריך האופציה לא נמצא.');
          err.statusCode = 404;
          throw err;
        }
      }

      const slot = normalizeTimeSlot(data.timeOfDay, data.startTime, data.endTime)
        || (isOption ? 'evening' as const : null);
      if (!slot) {
        const err: any = new Error('יש לבחור משבצת זמן: בוקר, צהריים או ערב.');
        err.statusCode = 400;
        throw err;
      }

      const slotError = validateSlotOnDate(parseDateLocal(possibleDate), slot);
      if (slotError) {
        const err: any = new Error(slotError);
        err.statusCode = 400;
        throw err;
      }

      if (!eventDate) {
        eventDate = await tx.eventDate.create({
          data: { date: possibleDate, status: newStatus, optionExpiresAt: expiryDate },
          include: { bookings: true },
        });
      } else if (!isOverrideTarget) {
        const stillHasOptions = hasOptionBookings(eventDate.bookings ?? []);
        const updatePayload: Record<string, unknown> = {};
        if (newStatus === 'OPTION') {
          if (eventDate.status !== 'BOOKED') {
            updatePayload.status = newStatus;
            updatePayload.optionExpiresAt = expiryDate;
          }
        } else if (newStatus === 'BOOKED' && !stillHasOptions) {
          updatePayload.status = 'BOOKED';
          updatePayload.optionExpiresAt = null;
        }
        if (Object.keys(updatePayload).length > 0) {
          eventDate = await tx.eventDate.update({
            where: { id: eventDate.id },
            data: updatePayload,
            include: { bookings: true },
          });
        }
      }

      const existingBookings = eventDate.bookings || [];
      const bookableSlots = getBookableSlotsForDate(parseDateLocal(possibleDate), existingBookings);
      if (!bookableSlots.includes(slot)) {
        const taken = getTakenSlots(existingBookings);
        const message = taken.has(slot)
          ? slotConflictMessage(slot, existingBookings)
          : (validateSlotOnDate(parseDateLocal(possibleDate), slot) || 'התאריך מלא — אין משבצות זמן פנויות.');
        const err: any = new Error(message);
        err.statusCode = 400;
        throw err;
      }

      if (newStatus === 'BOOKED' && eventDate.status !== 'BOOKED') {
        eventDate = await tx.eventDate.update({
          where: { id: eventDate.id },
          data: { status: 'BOOKED', optionExpiresAt: null },
          include: { bookings: true },
        });
      }

      const timeString = formatStoredTimeOfDay(slot, data.startTime, data.endTime);
      const eventCode = await allocateEventCode(newStatus === 'OPTION' ? 'OPT' : 'EVT', tx);

      const newBooking = await tx.booking.create({
        data: {
          clientAFullName: data.clientAFullName,
          clientAIdNumber: data.clientAIdNumber,
          clientAPhone: clientAPhoneCombined,
          clientAEmail: data.clientAEmail || null,
          clientAAddress: clientAAddressCombined,
          clientBFullName: data.clientBFullName || null,
          clientBIdNumber: data.clientBIdNumber || null,
          clientBPhone: clientBPhoneCombined || null,
          clientBEmail: data.clientBEmail || null,
          clientBAddress: clientBAddressCombined || null,
          
          eventDate: { 
            connect: { id: eventDate.id } 
          },
          
          eventType: data.eventType,
          timeOfDay: timeString,
          timeSlot: slot,
          guestCount: Number(data.guestCount) || 0,
          minimumGuestCount: Number(data.minimumGuestCount) || Number(data.guestCount) || 0,
          finalPricePortion: Number(data.finalPricePortion) || 0,
          basePrice: prices.basePrice,
          extrasPrice: prices.extrasPrice,
          externalExtrasPrice: prices.externalExtrasPrice,
          liveAdditionsTotal: prices.liveAdditionsTotal,
          totalPrice: prices.totalPrice,
          hallRentalPrice: data.hallRentalPrice ? Number(data.hallRentalPrice) : null, // 🔥 התיקון: שמירת מחיר אולם
          hasMusic: data.hasMusic !== undefined ? data.hasMusic : true,
          akumApprovalCode: data.akumApprovalCode || null,
          advancePaid: 0,
          totalPaid: 0,
          securityCheckStatus: 'PENDING',
          isContractSigned: !!(data.contractSigned && data.clientSignature),
          clientSignatureUrl: data.clientSignature || null,
          isOption: newStatus === 'OPTION',
          managerComments: data.managerComments || null,
          clientComments: data.clientComments || null,
          createdBy: data.createdBy || (isManager ? "מנהל מערכת" : "נציג מכירות"),
          eventCode,
          depositCheckUrl: data.depositCheckUrl || null,
          depositCheckDetails: data.depositCheckDetails || null,
          contractText: resolvedContractText,
          paymentTemplateId: data.paymentTemplateId || null,
          paymentTermsText: paymentTermsText || null,
        }
      });
      createdBookings.push(newBooking);
      
      eventsToEmit.push({ dateId: eventDate.id, status: newStatus });
    }
  }, neonTransactionOptions));

  eventsToEmit.forEach(ev => emitDateUpdated(ev));
  if (createdBookings.length > 0) {
    emitBookingUpdated(createdBookings[0].id);
  }

  if (data.contractSigned && data.clientSignature && createdBookings.length > 0) {
    try {
      const savedBooking = createdBookings[0];
      const firstDateItem = datesToProcess[0];
      const firstDateString = typeof firstDateItem === 'object' && firstDateItem !== null ? firstDateItem.date : firstDateItem;

      const pdfData = {
        eventCode: savedBooking.eventCode,
        isOption: newStatus === 'OPTION',
        clientAFullName: savedBooking.clientAFullName,
        clientAIdNumber: savedBooking.clientAIdNumber,
        clientAPhone: savedBooking.clientAPhone || undefined,
        clientAEmail: savedBooking.clientAEmail || undefined,
        clientBFullName: savedBooking.clientBFullName || undefined,
        clientBIdNumber: savedBooking.clientBIdNumber || undefined,
        clientBPhone: savedBooking.clientBPhone || undefined,
        clientBEmail: savedBooking.clientBEmail || undefined,
        eventDate: new Date(firstDateString).toString(),
        guestCount: savedBooking.guestCount,
        minimumGuestCount: savedBooking.minimumGuestCount ?? savedBooking.guestCount,
        eventType: savedBooking.eventType,
        timeOfDay: savedBooking.timeOfDay || undefined,
        clientSignatureUrl: data.clientSignature,
        eventForm: {} 
      };

      const contractPdfBuffer = await generateEventFormPDF(pdfData);
      const clientEmail = savedBooking.clientAEmail || savedBooking.clientBEmail;
      
      if (clientEmail) {
        await sendPDFToClient(
          clientEmail, 
          savedBooking.clientAFullName, 
          new Date(firstDateString).toString(), 
          contractPdfBuffer
        );
      }
    } catch (pdfError) {
      console.error("שגיאה בהפקת או שליחת החוזה הראשוני למייל:", pdfError);
    }
  }

  res.status(201).json({
    success: true,
    message: newStatus === 'OPTION' ? 'האופציות נשמרו והצעת המחיר נשלחה במייל!' : 'האירוע נשמר והחוזה נשלח!',
    data: createdBookings
  });
});

export const getBookingById = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { eventDate: true },
  });

  if (!booking) {
    return res.status(404).json({ success: false, message: 'ההזמנה לא נמצאה.' });
  }

  res.status(200).json({ success: true, data: booking });
});

export const getRelatedOptionBookings = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { eventDate: true },
  });

  if (!booking || !booking.isOption || booking.eventDate?.status !== 'OPTION') {
    return res.status(404).json({ success: false, message: 'אופציה לא נמצאה.' });
  }

  const createdAtStart = new Date(booking.createdAt.getTime() - 120_000);
  const createdAtEnd = new Date(booking.createdAt.getTime() + 120_000);

  const related = await prisma.booking.findMany({
    where: {
      clientAFullName: booking.clientAFullName,
      clientAPhone: booking.clientAPhone,
      createdBy: booking.createdBy,
      isOption: true,
      createdAt: { gte: createdAtStart, lte: createdAtEnd },
      eventDate: { status: 'OPTION' },
    },
    include: { eventDate: true },
    orderBy: { eventDate: { date: 'asc' } },
  });

  res.status(200).json({ success: true, data: related });
});

export const updateBooking = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const data = req.body;

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { eventDate: true },
  });

  if (!booking || !booking.eventDate) {
    return res.status(404).json({ success: false, message: 'ההזמנה לא נמצאה.' });
  }

  if (!canEditBookingDate(booking.eventDate.date)) {
    return res.status(403).json({ success: false, message: 'לא ניתן לערוך ביום האירוע או לאחריו.' });
  }

  if (!booking.isOption && !data.convertFromOption) {
    const hallPriceError = validateHallRentalPriceInput({
      eventType: data.eventType ?? booking.eventType,
      hallRentalPrice: data.hallRentalPrice ?? (booking as { hallRentalPrice?: number | null }).hallRentalPrice,
    });
    if (hallPriceError) {
      return res.status(400).json({ success: false, message: hallPriceError });
    }
  }

  if (
    data.convertFromOption
    && !booking.isOption
    && booking.eventDate.status !== 'OPTION'
  ) {
    return res.status(400).json({ success: false, message: 'ההזמנה כבר אינה אופציה.' });
  }

  if (data.convertFromOption) {
    const hallPriceError = validateHallRentalPriceInput({
      eventType: data.eventType ?? booking.eventType,
      hallRentalPrice: data.hallRentalPrice ?? (booking as { hallRentalPrice?: number | null }).hallRentalPrice,
    });
    if (hallPriceError) {
      return res.status(400).json({ success: false, message: hallPriceError });
    }
  }

  const clientAPhoneCombined = data.clientAPhone2
    ? `${data.clientAPhone} | נוסף: ${data.clientAPhone2}`
    : data.clientAPhone;
  const clientAAddressCombined = data.clientACity
    ? `${data.clientACity}, ${data.clientAAddress}`
    : data.clientAAddress;
  const clientBPhoneCombined = data.clientBPhone2
    ? `${data.clientBPhone} | נוסף: ${data.clientBPhone2}`
    : data.clientBPhone;
  const clientBAddressCombined = data.clientBCity
    ? `${data.clientBCity}, ${data.clientBAddress}`
    : data.clientBAddress;

  const slot = normalizeTimeSlot(data.timeOfDay, data.startTime, data.endTime);
  if (slot) {
    const slotError = validateSlotOnDate(parseDateLocal(booking.eventDate.date), slot);
    if (slotError) {
      return res.status(400).json({ success: false, message: slotError });
    }

    const siblings = await prisma.booking.findMany({
      where: { calendarDateId: booking.eventDate.id, id: { not: id } },
    });
    const taken = getTakenSlots(siblings);
    if (taken.has(slot)) {
      return res.status(400).json({
        success: false,
        message: slotConflictMessage(slot, siblings),
      });
    }
  }

  const timeString = slot
    ? formatStoredTimeOfDay(slot, data.startTime, data.endTime)
    : (data.startTime && data.endTime
      ? `${data.startTime} - ${data.endTime}`
      : booking.timeOfDay);

  const liveTotal = Number(booking.liveAdditionsTotal) || 0;
  const prices = extractPriceBreakdown(data, liveTotal);
  const isConverting = data.convertFromOption === true;
  const finalSignature = data.clientSignature ?? booking.clientSignatureUrl;
  let convertedEventCode: string | null = null;

  if (isConverting) {
    convertedEventCode = convertOptionCodeToEventCode(booking.eventCode);
    if (!convertedEventCode) {
      convertedEventCode = await allocateEventCode('EVT');
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updateData: Record<string, unknown> = {
      clientAFullName: data.clientAFullName,
      clientAIdNumber: data.clientAIdNumber,
      clientAPhone: clientAPhoneCombined,
      clientAEmail: data.clientAEmail || null,
      clientAAddress: clientAAddressCombined || null,
      clientBFullName: data.clientBFullName || null,
      clientBIdNumber: data.clientBIdNumber || null,
      clientBPhone: clientBPhoneCombined || null,
      clientBEmail: data.clientBEmail || null,
      clientBAddress: clientBAddressCombined || null,
      eventType: data.eventType,
      timeOfDay: timeString,
      ...(slot ? { timeSlot: slot } : {}),
      guestCount: Number(data.guestCount) || 0,
      minimumGuestCount: Number(data.minimumGuestCount) || Number(data.guestCount) || 0,
      finalPricePortion: Number(data.finalPricePortion) || 0,
      basePrice: prices.basePrice,
      extrasPrice: prices.extrasPrice,
      externalExtrasPrice: prices.externalExtrasPrice,
      liveAdditionsTotal: prices.liveAdditionsTotal,
      totalPrice: prices.totalPrice,
      hallRentalPrice: data.hallRentalPrice !== undefined ? Number(data.hallRentalPrice) : (booking as any).hallRentalPrice,
      hasMusic: data.hasMusic !== undefined ? data.hasMusic : booking.hasMusic,
      akumApprovalCode: data.akumApprovalCode || null,
      managerComments: data.managerComments || null,
      clientComments: data.clientComments || null,
      createdBy: data.createdBy || booking.createdBy,
      isContractSigned: data.clientSignature !== undefined
        ? !!(data.contractSigned && data.clientSignature)
        : isConverting ? !!finalSignature : booking.isContractSigned,
      clientSignatureUrl: data.clientSignature !== undefined ? data.clientSignature : booking.clientSignatureUrl,
      depositCheckUrl: data.depositCheckUrl !== undefined ? data.depositCheckUrl || null : (booking as { depositCheckUrl?: string | null }).depositCheckUrl,
      depositCheckDetails: data.depositCheckDetails !== undefined ? data.depositCheckDetails || null : (booking as { depositCheckDetails?: unknown }).depositCheckDetails,
      contractText: data.contractText !== undefined
        ? (data.contractText?.trim() || null)
        : (booking as { contractText?: string | null }).contractText,
      paymentTemplateId: data.paymentTemplateId !== undefined
        ? (data.paymentTemplateId || null)
        : (booking as { paymentTemplateId?: string | null }).paymentTemplateId,
      paymentTermsText: data.paymentTermsText !== undefined
        ? (data.paymentTermsText?.trim() || null)
        : (booking as { paymentTermsText?: string | null }).paymentTermsText,
      updatedBy: 'מערכת',
    };

    if (isConverting) {
      updateData.isOption = false;
      updateData.eventCode = convertedEventCode;
      updateData.clientSignatureUrl = finalSignature;
      if (data.advancePaid !== undefined) {
        const paid = Number(data.advancePaid) || 0;
        updateData.advancePaid = paid;
        updateData.paidAmount = paid;
        updateData.paymentStatus = paid > 0 ? 'PARTIAL' : 'pending';
      }
    }

    const updatedBooking = await tx.booking.update({
      where: { id },
      data: updateData,
      include: { eventDate: true },
    });

    if (isConverting) {
      await tx.eventDate.update({
        where: { id: booking.eventDate.id },
        data: { status: 'BOOKED', optionExpiresAt: null },
      });

      const releaseDateIds: string[] = Array.isArray(data.releaseDateIds) ? data.releaseDateIds : [];
      if (releaseDateIds.length > 0) {
        await tx.eventDate.updateMany({
          where: { id: { in: releaseDateIds } },
          data: { status: 'AVAILABLE', optionExpiresAt: null, clientName: null, clientPhone: null, clientEmail: null },
        });
        await tx.booking.deleteMany({
          where: { calendarDateId: { in: releaseDateIds } },
        });
      }
    } else if (booking.eventDate.status === 'OPTION' && data.optionDurationHours) {
      const expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + Number(data.optionDurationHours));
      await tx.eventDate.update({
        where: { id: booking.eventDate.id },
        data: { optionExpiresAt: expiryDate },
      });
    }
    
    return updatedBooking;
  });

  if (isConverting) {
    emitDateUpdated({ dateId: booking.eventDate.id, status: 'BOOKED' });
    const releaseDateIds: string[] = Array.isArray(data.releaseDateIds) ? data.releaseDateIds : [];
    releaseDateIds.forEach((dateId: string) => {
      emitDateUpdated({ dateId, status: 'AVAILABLE' });
    });

    if (finalSignature && data.contractSigned) {
      try {
        const pdfData = {
          eventCode: updated.eventCode,
          isOption: false,
          clientAFullName: updated.clientAFullName,
          clientAIdNumber: updated.clientAIdNumber,
          clientAPhone: updated.clientAPhone || undefined,
          clientAEmail: updated.clientAEmail || undefined,
          clientBFullName: updated.clientBFullName || undefined,
          clientBIdNumber: updated.clientBIdNumber || undefined,
          clientBPhone: updated.clientBPhone || undefined,
          clientBEmail: updated.clientBEmail || undefined,
          eventDate: booking.eventDate.date.toString(),
          guestCount: updated.guestCount,
          minimumGuestCount: updated.minimumGuestCount ?? updated.guestCount,
          eventType: updated.eventType,
          timeOfDay: updated.timeOfDay || undefined,
          clientSignatureUrl: finalSignature,
          eventForm: {},
        };
        const contractPdfBuffer = await generateEventFormPDF(pdfData);
        const clientEmail = updated.clientAEmail || updated.clientBEmail;
        if (clientEmail) {
          await sendPDFToClient(
            clientEmail,
            updated.clientAFullName,
            booking.eventDate.date.toString(),
            contractPdfBuffer,
          );
        }
      } catch (pdfError) {
        console.error('שגיאה בהפקת או שליחת חוזה ה-PDF:', pdfError);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'האירוע נסגר ונשמר בהצלחה!',
      data: updated,
    });
  }

  emitDateUpdated({ dateId: booking.eventDate.id, status: booking.eventDate.status });
  emitBookingUpdated(id);
  res.status(200).json({ success: true, message: 'ההזמנה עודכנה בהצלחה.', data: updated });
});

export const getContractTemplate = catchAsync(async (_req: Request, res: Response) => {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } });
  const paymentMeta = getPaymentTemplatesFromSettings(settings);
  const paymentTermsText = await resolveDefaultPaymentTermsText();
  const contractBaseText = await getContractText();
  const contractText = await resolveContractWithPaymentTerms({ paymentTermsText });

  res.status(200).json({
    success: true,
    data: {
      contractText,
      contractBaseText,
      paymentTermsText,
      paymentTemplateId: paymentMeta.defaultTemplateId,
      paymentTemplates: paymentMeta.templates,
      defaultPaymentTemplateId: paymentMeta.defaultTemplateId,
    },
  });
});

export const getNextEventCode = catchAsync(async (req: Request, res: Response) => {
  const prefix: EventCodePrefix = req.query.prefix === 'EVT' ? 'EVT' : 'OPT';
  const count = Math.min(Math.max(Number(req.query.count) || 1, 1), 10);
  const codes = await peekNextEventCodes(prefix, count);

  res.status(200).json({
    success: true,
    data: {
      code: codes[0],
      codes,
    },
  });
});

export const getCancellationStats = catchAsync(async (req: Request, res: Response) => {
  const { month, year } = req.query; 

  let dateFilter = {};

  if (month && year) {
    const startDate = new Date(Number(year), Number(month) - 1, 1);
    const endDate = new Date(Number(year), Number(month), 1);
    dateFilter = {
      createdAt: {
        gte: startDate, 
        lt: endDate,    
      }
    };
  } 
  else if (year) {
    const startDate = new Date(Number(year), 0, 1); 
    const endDate = new Date(Number(year) + 1, 0, 1); 
    dateFilter = {
      createdAt: {
        gte: startDate,
        lt: endDate,
      }
    };
  }

  const stats = await prisma.cancellationLog.groupBy({
    by: ['reason'],
    where: dateFilter, 
    _count: {
      reason: true,
    },
    orderBy: {
      _count: {
        reason: 'desc',
      },
    },
  });

  const formattedStats = stats.map(stat => ({
    reason: stat.reason,
    count: stat._count.reason,
  }));

  res.status(200).json({ success: true, data: formattedStats });
});

export const addEventAddition = async (req: Request, res: Response) => {
  try {
    const bookingId = req.params.id as string; 
    const { description, cost, staffName, signature, agreedToTerms } = req.body;

    if (!agreedToTerms) {
      return res.status(400).json({ error: 'חובה להסכים לתנאי התשלום' });
    }

    const newAddition = await prisma.$transaction(async (tx) => {
      const addition = await tx.eventAddition.create({
        data: {
          bookingId,
          description,
          cost: Number(cost),
          staffName,
          signature,
          agreedToTerms
        }
      });

      const currentBooking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (currentBooking) {
        const additionCost = Number(cost) || 0;
        const currentLive = Number(currentBooking.liveAdditionsTotal) || 0;
        const newLiveTotal = currentLive + additionCost;
        const basePrice = Number(currentBooking.basePrice) || 0;
        const extrasPrice = Number(currentBooking.extrasPrice) || 0;
        const externalExtrasPrice = Number(currentBooking.externalExtrasPrice) || 0;

        await tx.booking.update({
          where: { id: bookingId },
          data: {
            liveAdditionsTotal: newLiveTotal,
            totalPrice: basePrice + extrasPrice + externalExtrasPrice + newLiveTotal,
          },
        });
      }
      
      return addition;
    });

    emitBookingUpdated(bookingId);
    res.status(201).json({ message: 'התוספת נשמרה בהצלחה!', addition: newAddition });
  } catch (error) {
    console.error('Error adding event addition:', error);
    res.status(500).json({ error: 'שגיאת שרת פנימית בעת שמירת התוספת' });
  }
};

export const finalizeBooking = catchAsync(async (req: Request, res: Response) => {
  const { bookingId, advancePaid, akumApprovalCode, hasMusic, clientSignature, tables } = req.body;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { eventDate: true, eventForm: true }
  });

  if (!booking || !booking.eventDate) return res.status(404).json({ success: false, message: 'ההזמנה לא נמצאה.' });

  let eventCode = convertOptionCodeToEventCode(booking.eventCode);
  if (!eventCode) {
    eventCode = await allocateEventCode('EVT');
  }

  const finalSignature = clientSignature || booking.clientSignatureUrl;

  const updated = await prisma.$transaction(async (tx) => {
    const updatedBooking = await tx.booking.update({
      where: { id: bookingId },
      data: {
        hasMusic,
        akumApprovalCode,
        advancePaid: Number(advancePaid),
        paidAmount: Number(advancePaid),
        paymentStatus: 'PARTIAL',
        isOption: false,
        eventCode,
        isContractSigned: !!finalSignature,
        clientSignatureUrl: finalSignature 
      }
    });

    await tx.eventDate.update({
      where: { id: booking.eventDate.id },
      data: { status: 'BOOKED', optionExpiresAt: null }
    });

    if (tables && Array.isArray(tables)) {
      await tx.eventForm.upsert({
        where: { bookingId },
        update: {
          tables: {
            deleteMany: {},
            create: tables.map((table: any) => ({
              tableNumber: table.id,
              positionX: table.x,
              positionY: table.y,
            }))
          }
        },
        create: {
          bookingId,
          tables: {
            create: tables.map((table: any) => ({
              tableNumber: table.id,
              positionX: table.x,
              positionY: table.y,
            }))
          }
        }
      });
    }

    return updatedBooking;
  });

  if (finalSignature) {
    try {
      const pdfData = {
        eventCode: updated.eventCode,
        isOption: false,
        clientAFullName: updated.clientAFullName,
        clientAIdNumber: updated.clientAIdNumber,
        clientAPhone: updated.clientAPhone || undefined,
        clientAEmail: updated.clientAEmail || undefined,
        clientBFullName: updated.clientBFullName || undefined,
        clientBIdNumber: updated.clientBIdNumber || undefined,
        clientBPhone: updated.clientBPhone || undefined,
        clientBEmail: updated.clientBEmail || undefined,
        eventDate: booking.eventDate.date.toString(),
        guestCount: updated.guestCount,
        minimumGuestCount: updated.minimumGuestCount ?? updated.guestCount,
        eventType: updated.eventType,
        timeOfDay: updated.timeOfDay || undefined,
        clientSignatureUrl: finalSignature,
        eventForm: booking.eventForm || {} 
      };

      const contractPdfBuffer = await generateEventFormPDF(pdfData);
      
      const clientEmail = updated.clientAEmail || updated.clientBEmail;
      if (clientEmail) {
        await sendPDFToClient(
          clientEmail, 
          updated.clientAFullName, 
          booking.eventDate.date.toString(), 
          contractPdfBuffer
        );
      }
    } catch (pdfError) {
      console.error("שגיאה בהפקת או שליחת חוזה ה-PDF:", pdfError);
    }
  }

  emitDateUpdated({ dateId: booking.eventDate.id, status: 'BOOKED' });
  emitBookingUpdated(bookingId);
  res.status(200).json({ success: true, message: 'האירוע נסגר והחוזה נחתם בהצלחה!', data: updated });
});

export const getAllBookings = catchAsync(async (req: Request, res: Response) => {
  const bookings = await prisma.booking.findMany({
    orderBy: { createdAt: 'desc' },
    include: { eventDate: true, eventForm: true, additions: true } 
  });
  res.status(200).json({ success: true, count: bookings.length, data: bookings });
});

export const releaseOptions = catchAsync(async (req: Request, res: Response) => {
  const { dateIds, cancelReason, clientName } = req.body; 
  
  if (!dateIds || dateIds.length === 0) return res.status(400).json({ success: false, message: 'לא נבחרו תאריכים לשחרור.' });

  await prisma.$transaction(async (tx) => {
    await tx.eventDate.updateMany({
      where: { id: { in: dateIds } },
      data: { status: 'AVAILABLE', optionExpiresAt: null, clientName: null, clientPhone: null, clientEmail: null }
    });

    await tx.booking.deleteMany({ 
      where: { eventDate: { id: { in: dateIds } } } 
    });
    
    if (cancelReason) {
      await tx.cancellationLog.create({
        data: {
          reason: cancelReason,
          clientName: clientName || 'לא צוין',
        }
      });
    }
  });

  emitDateUpdatedMany(dateIds.map((dateId: string) => ({ dateId, status: 'AVAILABLE' })));
  emitBookingUpdated();

  res.status(200).json({ success: true, message: 'התאריכים שוחררו והסטטיסטיקה נשמרה בהצלחה.' });
});

export const bumpOption = catchAsync(async (req: Request, res: Response) => {
  const { dateId } = req.body;
  const eventDate = await prisma.eventDate.findUnique({
    where: { id: dateId },
    include: { bookings: true } 
  });

  if (!eventDate || eventDate.status !== 'OPTION') return res.status(400).json({ success: false, message: 'התאריך אינו מוגדר כאופציה.' });

  const newDeadline = new Date();
  newDeadline.setHours(newDeadline.getHours() + 3);
  await prisma.eventDate.update({ where: { id: dateId }, data: { optionExpiresAt: newDeadline } });

  for (const booking of eventDate.bookings) {
      if (booking.clientAEmail) await sendBumpEmail(booking.clientAEmail, booking.clientAFullName, eventDate.date.toString(), newDeadline);
      if (booking.clientAPhone) {
          await sendBumpWhatsApp(booking.clientAPhone.split(' | ')[0].trim(), booking.clientAFullName, eventDate.date.toString(), newDeadline);
      }
  }

  emitDateUpdated({ dateId, status: 'OPTION' });
  emitBookingUpdated();

  res.status(200).json({ success: true, message: 'הדד-ליין קוצר.', newDeadline });
});

export const notifyOptionInterest = catchAsync(async (req: Request, res: Response) => {
  const { bookingId, message } = req.body as { bookingId?: string; message?: string };

  if (!bookingId) {
    return res.status(400).json({ success: false, message: 'חסר מזהה הזמנה.' });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { eventDate: true },
  });

  if (!booking || !booking.isOption) {
    return res.status(400).json({ success: false, message: 'ההזמנה אינה אופציה פעילה.' });
  }

  if (!booking.eventDate) {
    return res.status(400).json({ success: false, message: 'לא נמצא תאריך מקושר להזמנה.' });
  }

  const eventDateStr = booking.eventDate.date.toString();
  const skippedReasons: string[] = [];
  let emailSent = false;
  let whatsappSent = false;
  let whatsappSimulated = false;

  if (booking.clientAEmail) {
    emailSent = await sendOptionInterestEmail(
      booking.clientAEmail,
      booking.clientAFullName,
      eventDateStr,
      message,
    );
    if (!emailSent) {
      skippedReasons.push('שליחת המייל נכשלה');
    }
  } else {
    skippedReasons.push('לא הוזן אימייל ללקוח');
  }

  if (booking.clientAPhone) {
    const phone = booking.clientAPhone.split(' | ')[0].trim();
    const waResult = await sendOptionInterestWhatsApp(
      phone,
      booking.clientAFullName,
      eventDateStr,
      message,
    );
    whatsappSent = waResult.sent;
    whatsappSimulated = waResult.simulated;

    if (waResult.hasWhatsApp === false) {
      skippedReasons.push('למספר הטלפון אין וואטסאפ');
    } else if (waResult.simulated) {
      skippedReasons.push('וואטסאפ: לא מוגדר (לא נשלח בפועל)');
    } else if (!waResult.sent) {
      skippedReasons.push('שליחת הוואטסאפ נכשלה');
    }
  } else {
    skippedReasons.push('לא הוזן טלפון ללקוח');
  }

  if (!emailSent && !whatsappSent) {
    return res.status(400).json({
      success: false,
      message: 'לא ניתן לשלוח — חסרים פרטי קשר או השליחה נכשלה.',
      skippedReasons,
    });
  }

  res.status(200).json({
    success: true,
    message: 'ההודעה נשלחה בהצלחה.',
    emailSent,
    whatsappSent,
    whatsappSimulated,
    skippedReasons,
  });
});