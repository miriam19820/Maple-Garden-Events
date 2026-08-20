/** Mock מרכזי ל-Prisma — מאפשר שליטה ב-AuthorizedUser וב-SystemSettings בכל בדיקה */

export const authorizedUserFindUnique = jest.fn();
export const systemSettingsFindUnique = jest.fn();
export const bookingFindUnique = jest.fn();
export const bookingFindMany = jest.fn();
export const bookingUpdate = jest.fn();
export const bookingDeleteMany = jest.fn();
export const eventDateFindMany = jest.fn();
export const eventDateUpdateMany = jest.fn();
export const eventDateDeleteMany = jest.fn();
export const eventAdditionDeleteMany = jest.fn();
export const feedbackDeleteMany = jest.fn();
export const eventFormDeleteMany = jest.fn();
export const eventCheckInUpsert = jest.fn();
export const eventCheckInFindUnique = jest.fn();
export const eventCheckInCreate = jest.fn();
export const eventCheckInUpdate = jest.fn();
export const whatsappInboundCreate = jest.fn();
export const whatsappInboundUpdateMany = jest.fn();
export const tenantFindFirst = jest.fn();

const prismaMock: Record<string, unknown> = {
  authorizedUser: {
    findUnique: authorizedUserFindUnique,
  },
  systemSettings: {
    findUnique: systemSettingsFindUnique,
  },
  booking: {
    findUnique: bookingFindUnique,
    findMany: bookingFindMany,
    update: bookingUpdate,
    deleteMany: bookingDeleteMany,
  },
  eventDate: {
    findMany: eventDateFindMany,
    updateMany: eventDateUpdateMany,
    deleteMany: eventDateDeleteMany,
  },
  eventAddition: {
    deleteMany: eventAdditionDeleteMany,
  },
  feedback: {
    deleteMany: feedbackDeleteMany,
  },
  eventForm: {
    deleteMany: eventFormDeleteMany,
  },
  eventCheckIn: {
    upsert: eventCheckInUpsert,
    findUnique: eventCheckInFindUnique,
    create: eventCheckInCreate,
    update: eventCheckInUpdate,
  },
  whatsAppInboundMessage: {
    create: whatsappInboundCreate,
    updateMany: whatsappInboundUpdateMany,
  },
  tenant: {
    findFirst: tenantFindFirst,
  },
};

prismaMock.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock));

export default prismaMock;
