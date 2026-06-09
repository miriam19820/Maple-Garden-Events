import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { sendBumpEmail } from '../utils/mailer';
import { sendBumpWhatsApp } from '../utils/whatsapp';
import { catchAsync } from '../middlewares/errorHandler';
import { io } from '../server';
import {
  normalizeTimeSlot,
  formatStoredTimeOfDay,
  getTakenSlots,
  SLOT_LABELS,
} from '../utils/timeSlot';
import {
  allocateEventCode,
  convertOptionCodeToEventCode,
  peekNextEventCodes,
  type EventCodePrefix,
} from '../utils/eventCode';

function canEditBookingDate(eventDate: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDay = new Date(eventDate);
  eventDay.setHours(0, 0, 0, 0);
  return today < eventDay;
}

export const createBooking = catchAsync(async (req: Request, res: Response) => {
  const data = req.body;
  const isManager = data.userRole === 'manager';

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
  const newStatus = isOption ? 'OPTION' : 'BOOKED';

  let expiryDate: Date | null = null;
  if (newStatus === 'OPTION') {
    const hoursToAdd = data.optionDurationHours ? Number(data.optionDurationHours) : 48;
    expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + hoursToAdd);
  }

  const calculatedTotalPrice = data.guestCount * data.finalPricePortion;
  const clientAPhoneCombined = data.clientAPhone2 ? `${data.clientAPhone} | נוסף: ${data.clientAPhone2}` : data.clientAPhone;
  const clientAAddressCombined = data.clientACity ? `${data.clientACity}, ${data.clientAAddress}` : data.clientAAddress;
  const clientBPhoneCombined = data.clientBPhone2 ? `${data.clientBPhone} | נוסף: ${data.clientBPhone2}` : data.clientBPhone;
  const clientBAddressCombined = data.clientBCity ? `${data.clientBCity}, ${data.clientBAddress}` : data.clientBAddress;

  const createdBookings = [];

  for (const dateItem of datesToProcess) {
    const dateString = typeof dateItem === 'object' && dateItem !== null ? dateItem.date : dateItem;
    const possibleDate = new Date(dateString);
    
    if (isNaN(possibleDate.getTime())) continue;

    let eventDate = await prisma.eventDate.findFirst({
      where: { date: possibleDate },
      include: { bookings: true },
    });
    if (!eventDate) {
      eventDate = await prisma.eventDate.create({
        data: { date: possibleDate, status: newStatus, optionExpiresAt: expiryDate },
        include: { bookings: true },
      });
    } else {
      const updatePayload: Record<string, unknown> = {};
      if (newStatus === 'BOOKED') {
        updatePayload.status = 'BOOKED';
        updatePayload.optionExpiresAt = null;
      } else if (eventDate.status !== 'BOOKED') {
        updatePayload.status = newStatus;
        updatePayload.optionExpiresAt = expiryDate;
      }
      if (Object.keys(updatePayload).length > 0) {
        eventDate = await prisma.eventDate.update({
          where: { id: eventDate.id },
          data: updatePayload,
          include: { bookings: true },
        });
      }
    }

    const existingBookings = eventDate.bookings || [];
    if (existingBookings.length >= 3) {
      return res.status(400).json({
        success: false,
        message: 'התאריך מלא — כבר קיימים 3 אירועים (בוקר, צהריים וערב).',
      });
    }

    const slot = normalizeTimeSlot(data.timeOfDay, data.startTime, data.endTime);
    if (!slot) {
      return res.status(400).json({
        success: false,
        message: 'יש לבחור משבצת זמן: בוקר, צהריים או ערב.',
      });
    }

    const taken = getTakenSlots(existingBookings);
    if (taken.has(slot)) {
      return res.status(400).json({
        success: false,
        message: `כבר קיים אירוע ב${SLOT_LABELS[slot]} בתאריך זה.`,
      });
    }

    const timeString = formatStoredTimeOfDay(slot, data.startTime, data.endTime);
    const eventCode = await allocateEventCode(newStatus === 'OPTION' ? 'OPT' : 'EVT');

    const newBooking = await prisma.booking.create({
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
        guestCount: Number(data.guestCount) || 0,
        finalPricePortion: Number(data.finalPricePortion) || 0,
        totalPrice: calculatedTotalPrice || 0,
        hasMusic: data.hasMusic !== undefined ? data.hasMusic : true,
        akumApprovalCode: data.akumApprovalCode || null,
        advancePaid: 0,
        totalPaid: 0,
        securityCheckStatus: 'PENDING',
        isContractSigned: false,
        isOption: newStatus === 'OPTION',
        managerComments: data.managerComments || null,
        clientComments: data.clientComments || null,
        createdBy: isManager ? "מנהל מערכת" : "נציג מכירות",
        eventCode,
      }
    });
    createdBookings.push(newBooking);
    io.emit('date-updated', { dateId: eventDate.id, status: newStatus });
  }

  res.status(201).json({
    success: true,
    message: newStatus === 'OPTION' ? 'האופציות נשמרו בהצלחה!' : 'האירוע נשמר ונסגר בהצלחה!',
    data: createdBookings
  });
});

export const getAllBookings = catchAsync(async (req: Request, res: Response) => {
  const bookings = await prisma.booking.findMany({
    orderBy: { createdAt: 'desc' },
    include: { eventDate: true, eventForm: true }
  });
  res.status(200).json({ success: true, count: bookings.length, data: bookings });
});

export const releaseOptions = catchAsync(async (req: Request, res: Response) => {
  const { dateIds, cancelReason, clientName } = req.body; 
  
  if (!dateIds || dateIds.length === 0) return res.status(400).json({ success: false, message: 'לא נבחרו תאריכים לשחרור.' });

  await prisma.eventDate.updateMany({
    where: { id: { in: dateIds } },
    data: { status: 'AVAILABLE', optionExpiresAt: null, clientName: null, clientPhone: null, clientEmail: null }
  });

  await prisma.booking.deleteMany({ 
    where: { eventDate: { id: { in: dateIds } } } 
  });
  
  if (cancelReason) {
    await prisma.cancellationLog.create({
      data: {
        reason: cancelReason,
        clientName: clientName || 'לא צוין',
      }
    });
  }

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

  res.status(200).json({ success: true, message: 'הדד-ליין קוצר.', newDeadline });
});

export const finalizeBooking = catchAsync(async (req: Request, res: Response) => {
  const { bookingId, advancePaid, akumApprovalCode, hasMusic } = req.body;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { eventDate: true }
  });

  if (!booking || !booking.eventDate) return res.status(404).json({ success: false, message: 'ההזמנה לא נמצאה.' });

  let eventCode = convertOptionCodeToEventCode(booking.eventCode);
  if (!eventCode) {
    eventCode = await allocateEventCode('EVT');
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      hasMusic,
      akumApprovalCode,
      advancePaid: Number(advancePaid),
      paidAmount: Number(advancePaid),
      paymentStatus: 'PARTIAL',
      isOption: false,
      eventCode,
    }
  });

  await prisma.eventDate.update({
    where: { id: booking.eventDate.id },
    data: { status: 'BOOKED', optionExpiresAt: null }
  });

  io.emit('date-updated', { dateId: booking.eventDate.id, status: 'BOOKED' });
  res.status(200).json({ success: true, message: 'האירוע נסגר בהצלחה!', data: updated });
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
    const siblings = await prisma.booking.findMany({
      where: { calendarDateId: booking.eventDate.id, id: { not: id } },
    });
    const taken = getTakenSlots(siblings);
    if (taken.has(slot)) {
      return res.status(400).json({
        success: false,
        message: `כבר קיים אירוע ב${SLOT_LABELS[slot]} בתאריך זה.`,
      });
    }
  }

  const timeString = slot
    ? formatStoredTimeOfDay(slot, data.startTime, data.endTime)
    : (data.startTime && data.endTime
      ? `${data.startTime} - ${data.endTime}`
      : booking.timeOfDay);

  const calculatedTotalPrice =
    (Number(data.guestCount) || 0) * (Number(data.finalPricePortion) || 0) || booking.totalPrice;

  const updated = await prisma.booking.update({
    where: { id },
    data: {
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
      guestCount: Number(data.guestCount) || 0,
      finalPricePortion: Number(data.finalPricePortion) || 0,
      totalPrice: calculatedTotalPrice,
      hasMusic: data.hasMusic !== undefined ? data.hasMusic : booking.hasMusic,
      akumApprovalCode: data.akumApprovalCode || null,
      managerComments: data.managerComments || null,
      clientComments: data.clientComments || null,
      createdBy: data.createdBy || booking.createdBy,
      updatedBy: 'מערכת',
    },
    include: { eventDate: true },
  });

  if (booking.eventDate.status === 'OPTION' && data.optionDurationHours) {
    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + Number(data.optionDurationHours));
    await prisma.eventDate.update({
      where: { id: booking.eventDate.id },
      data: { optionExpiresAt: expiryDate },
    });
  }

  io.emit('date-updated', { dateId: booking.eventDate.id, status: booking.eventDate.status });
  res.status(200).json({ success: true, message: 'ההזמנה עודכנה בהצלחה.', data: updated });
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