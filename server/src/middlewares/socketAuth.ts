import { Socket } from 'socket.io';
import { AUTH_COOKIE_NAME, parseCookieHeader, verifyAuthToken } from '../utils/authCookie';

export function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void): void {
  const cookies = parseCookieHeader(socket.handshake.headers.cookie);
  const tokenFromCookie = cookies[AUTH_COOKIE_NAME];

  const authHeader = socket.handshake.headers.authorization;
  const tokenFromBearer = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  const token = tokenFromCookie || tokenFromBearer;
  if (!token) {
    next(new Error('Unauthorized'));
    return;
  }

  try {
    socket.data.user = verifyAuthToken(token);
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
}
