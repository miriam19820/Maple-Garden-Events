import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import prisma from '../config/prisma';
import { AuthRequest } from '../middlewares/auth';
import {
  clearSessionCookies,
  extractRefreshToken,
  generateCsrfToken,
  setSessionCookies,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/authCookie';
import { catchAsync } from '../middlewares/errorHandler';
import { isValidRole } from '../middlewares/requireRole';
import { AppError } from '../utils/AppError';
import { getServerTranslation, resolveLocaleFromRequest, T } from '../i18n/getServerTranslation';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function issueSession(res: Response, email: string, name: string, role: string) {
  const accessToken = signAccessToken(email, name, role);
  const refreshToken = signRefreshToken(email, name, role);
  const csrfToken = generateCsrfToken();
  setSessionCookies(res, accessToken, refreshToken, csrfToken);
}

export const login = catchAsync(async (req: Request, res: Response) => {
  const locale = resolveLocaleFromRequest(req);
  const { t } = getServerTranslation(locale);
  const { token } = req.body;

  if (!token) {
    throw AppError.badRequest(t(T.SERVER.AUTH.NO_TOKEN));
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    throw AppError.unauthorized(t(T.SERVER.AUTH.GOOGLE_FAILED));
  }

  if (!payload?.email) {
    throw AppError.unauthorized(t(T.SERVER.AUTH.INVALID_TOKEN));
  }

  const googleUserEmail = payload.email.toLowerCase().trim();
  const userName = payload.name || t(T.SERVER.AUTH.DEFAULT_ADMIN_NAME);

  const user = await prisma.authorizedUser.findUnique({
    where: { email: googleUserEmail },
  });

  if (!user) {
    throw AppError.forbidden(t(T.SERVER.AUTH.ACCESS_DENIED));
  }

  if (!isValidRole(user.role)) {
    throw AppError.forbidden(t(T.SERVER.AUTH.INVALID_ROLE));
  }

  issueSession(res, googleUserEmail, userName, user.role);

  return res.status(200).json({
    success: true,
    message: t(T.SERVER.AUTH.LOGIN_SUCCESS),
    user: { role: user.role, name: userName, email: googleUserEmail },
  });
});

export const refresh = catchAsync(async (req: Request, res: Response) => {
  const locale = resolveLocaleFromRequest(req);
  const { t } = getServerTranslation(locale);
  const refreshToken = extractRefreshToken(req);
  if (!refreshToken) {
    throw AppError.unauthorized(t(T.SERVER.AUTH.REFRESH_MISSING));
  }

  let user;
  try {
    user = verifyRefreshToken(refreshToken);
  } catch {
    clearSessionCookies(res);
    throw AppError.unauthorized(t(T.SERVER.AUTH.REFRESH_INVALID));
  }

  const authorized = await prisma.authorizedUser.findUnique({
    where: { email: user.email },
  });
  if (!authorized) {
    clearSessionCookies(res);
    throw AppError.forbidden(t(T.SERVER.AUTH.REFRESH_FORBIDDEN));
  }

  if (!isValidRole(authorized.role)) {
    clearSessionCookies(res);
    throw AppError.forbidden(t(T.SERVER.AUTH.REFRESH_INVALID_ROLE));
  }

  issueSession(res, user.email, user.name, authorized.role);
  return res.status(200).json({ success: true });
});

export const logout = (req: Request, res: Response) => {
  const locale = resolveLocaleFromRequest(req);
  const { t } = getServerTranslation(locale);
  clearSessionCookies(res);
  res.status(200).json({ success: true, message: t(T.SERVER.AUTH.LOGOUT_SUCCESS) });
};

export const me = catchAsync(async (req: AuthRequest, res: Response) => {
  res.status(200).json({ success: true, user: req.user });
});
