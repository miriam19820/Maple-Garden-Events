import { AppError } from './AppError';

export class ForbiddenError extends AppError {
  constructor(message = 'אין הרשאה') {
    super(message, { statusCode: 403, code: 'FORBIDDEN', isOperational: true });
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'לא נמצא') {
    super(message, { statusCode: 404, code: 'NOT_FOUND', isOperational: true });
    this.name = 'NotFoundError';
  }
}
