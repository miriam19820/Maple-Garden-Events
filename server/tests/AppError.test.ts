import {
  AppError,
  isAppError,
  isOperationalError,
  shouldReportToMonitoring,
} from '../src/utils/AppError';
import { ForbiddenError, NotFoundError } from '../src/utils/httpErrors';

describe('AppError', () => {
  it('marks 4xx helpers as operational', () => {
    const err = AppError.badRequest('bad', 'X', { bookingId: 'b1' });
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(400);
    expect(err.isOperational).toBe(true);
    expect(err.code).toBe('X');
    expect(err.context).toEqual({ bookingId: 'b1' });
    expect(isAppError(err)).toBe(true);
    expect(isOperationalError(err)).toBe(true);
    expect(shouldReportToMonitoring(err, 400)).toBe(false);
  });

  it('reports internal / non-operational errors', () => {
    const err = AppError.internal('boom', { code: 'DB', context: { step: 'tx' } });
    expect(err.isOperational).toBe(false);
    expect(shouldReportToMonitoring(err, 500)).toBe(true);
  });

  it('reports HTTP 500 even for operational AppError', () => {
    const err = new AppError('unavailable', { statusCode: 503, isOperational: true });
    expect(shouldReportToMonitoring(err, 503)).toBe(true);
  });

  it('subclassed domain errors stay operational', () => {
    expect(isOperationalError(new ForbiddenError())).toBe(true);
    expect(isOperationalError(new NotFoundError())).toBe(true);
    expect(shouldReportToMonitoring(new ForbiddenError(), 403)).toBe(false);
  });

  it('duck-typed 4xx errors are operational', () => {
    const err = Object.assign(new Error('nope'), { statusCode: 409 });
    expect(isOperationalError(err)).toBe(true);
    expect(shouldReportToMonitoring(err, 409)).toBe(false);
    expect(shouldReportToMonitoring(err, 500)).toBe(true);
  });
});
