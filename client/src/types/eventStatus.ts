export const EventStatus = {
  AVAILABLE: 'AVAILABLE',
  CHECKING: 'CHECKING',
  OPTION: 'OPTION',
  BOOKED: 'BOOKED',
  ARCHIVED: 'ARCHIVED',
  BLOCKED: 'BLOCKED',
  FORBIDDEN: 'FORBIDDEN'
} as const;

export type EventStatus = typeof EventStatus[keyof typeof EventStatus];