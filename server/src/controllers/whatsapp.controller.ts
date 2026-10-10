/**
 * WhatsApp API (§28).
 *
 * EVERY query is scoped by `req.user.tenantId`, which auth.ts takes from the database
 * rather than the JWT. There is no code path here that accepts a tenant id from the
 * client (§20).
 */

import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middlewares/auth';
import { catchAsync } from '../middlewares/errorHandler';
import { NotFoundError } from '../utils/httpErrors';
import { paginationMeta, parsePagination } from '../utils/pagination';
import { logger } from '../utils/logger';
import { phoneMatchSuffix } from '../Services/whatsapp/phone';
import {
  assignConversation,
  getWhatsAppHealth,
  listAutomationHandlers,
  listTemplates,
  markConversationRead,
  queueWhatsAppMessage,
  setConversationStatus,
  upsertTemplate,
  deleteTemplate,
  buildTemplateComponents,
  type SendCommand,
} from '../Services/whatsapp';
import type { TemplateParameterSpec } from '../Services/whatsapp/template.service';
import type { ConversationStatus } from '../Services/whatsapp/types';

/** Express 5 types route params as `string | string[]`; our routes only ever bind one. */
function param(req: AuthRequest, key: string): string {
  const value = req.params[key];
  return Array.isArray(value) ? value[0] : value;
}

/** Auth middleware guarantees this; the throw is a defensive assertion, not a check. */
function tenantOf(req: AuthRequest): string {
  const tenantId = req.user?.tenantId;
  if (!tenantId) throw new NotFoundError('Tenant not resolved for this request.');
  return tenantId;
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export const listConversations = catchAsync(async (req: AuthRequest, res: Response) => {
  const tenantId = tenantOf(req);
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
  const { status, assignedUserId, phone } = req.query as {
    status?: ConversationStatus;
    assignedUserId?: string;
    phone?: string;
  };

  const where = {
    tenantId,
    ...(status ? { status } : {}),
    ...(assignedUserId ? { assignedUserId } : {}),
    ...(phone ? { phoneNumber: { contains: phoneMatchSuffix(phone) } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.whatsAppConversation.findMany({
      where,
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
      include: {
        booking: { select: { id: true, eventCode: true, clientAFullName: true } },
        _count: { select: { messages: true } },
      },
    }),
    prisma.whatsAppConversation.count({ where }),
  ]);

  res.json({ success: true, data: rows, meta: paginationMeta(page, limit, total) });
});

export const getConversation = catchAsync(async (req: AuthRequest, res: Response) => {
  const tenantId = tenantOf(req);
  const conversation = await prisma.whatsAppConversation.findFirst({
    // tenantId in the filter — not a post-fetch check — so a wrong tenant is a 404.
    where: { id: param(req, 'id'), tenantId },
    include: {
      booking: { select: { id: true, eventCode: true, clientAFullName: true } },
      assignedUser: { select: { id: true, email: true } },
    },
  });
  if (!conversation) throw new NotFoundError('שיחת WhatsApp לא נמצאה.');
  res.json({ success: true, data: conversation });
});

export const listConversationMessages = catchAsync(async (req: AuthRequest, res: Response) => {
  const tenantId = tenantOf(req);
  const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);

  const conversation = await prisma.whatsAppConversation.findFirst({
    where: { id: param(req, 'id'), tenantId },
    select: { id: true },
  });
  if (!conversation) throw new NotFoundError('שיחת WhatsApp לא נמצאה.');

  const where = { tenantId, conversationId: conversation.id };
  const [rows, total] = await Promise.all([
    prisma.whatsAppMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        direction: true,
        messageType: true,
        content: true,
        templateName: true,
        status: true,
        externalMessageId: true,
        errorCode: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        failedAt: true,
        createdAt: true,
        // `payload` is deliberately excluded — raw provider data stays server-side (§44).
      },
    }),
    prisma.whatsAppMessage.count({ where }),
  ]);

  await markConversationRead({ tenantId, conversationId: conversation.id });

  res.json({ success: true, data: rows, meta: paginationMeta(page, limit, total) });
});

export const assignConversationHandler = catchAsync(async (req: AuthRequest, res: Response) => {
  const tenantId = tenantOf(req);
  const { assignedUserId } = req.body as { assignedUserId: string | null };

  if (assignedUserId) {
    // The assignee must belong to the same tenant.
    const user = await prisma.authorizedUser.findFirst({
      where: { id: assignedUserId, tenantId },
      select: { id: true },
    });
    if (!user) throw new NotFoundError('משתמש לא נמצא.');
  }

  const result = await assignConversation({ tenantId, conversationId: param(req, 'id'), assignedUserId });
  if (result.count === 0) throw new NotFoundError('שיחת WhatsApp לא נמצאה.');
  res.json({ success: true });
});

export const updateConversationStatusHandler = catchAsync(async (req: AuthRequest, res: Response) => {
  const tenantId = tenantOf(req);
  const result = await setConversationStatus({
    tenantId,
    conversationId: param(req, 'id'),
    status: (req.body as { status: ConversationStatus }).status,
  });
  if (result.count === 0) throw new NotFoundError('שיחת WhatsApp לא נמצאה.');
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

async function buildSendCommand(req: AuthRequest, tenantId: string): Promise<SendCommand> {
  const body = req.body as Record<string, unknown>;
  const kind = body.kind as string;
  const base = {
    tenantId,
    toPhone: body.toPhone as string,
    bookingId: (body.bookingId as string) ?? null,
    requestedBy: req.user?.email,
  };

  if (kind === 'template') {
    const template = await prisma.whatsAppTemplate.findFirst({
      where: {
        tenantId,
        name: body.templateName as string,
        language: (body.languageCode as string) ?? 'he',
      },
    });
    return {
      ...base,
      kind: 'template',
      templateName: body.templateName as string,
      languageCode: (body.languageCode as string) ?? undefined,
      components: buildTemplateComponents(
        (template?.parameters as TemplateParameterSpec[] | null) ?? null,
        (body.parameters as Record<string, string>) ?? {},
      ),
    };
  }

  if (kind === 'document') {
    return {
      ...base,
      kind: 'document',
      filename: body.filename as string,
      link: body.link as string | undefined,
      mediaId: body.mediaId as string | undefined,
      caption: body.caption as string | undefined,
    };
  }

  return { ...base, kind: 'text', body: body.body as string };
}

export const sendMessage = catchAsync(async (req: AuthRequest, res: Response) => {
  const tenantId = tenantOf(req);
  const command = await buildSendCommand(req, tenantId);

  // Errors here are WhatsAppError instances and flow through the standard handler.
  const outcome = await queueWhatsAppMessage(command);

  logger.info('WhatsApp message queued via API', {
    tenantId,
    actor: req.user?.email,
    conversationId: outcome.conversationId,
    outboxId: outcome.outboxId,
    kind: command.kind,
  });

  res.status(202).json({ success: true, data: outcome });
});

export const sendMessageInConversation = catchAsync(async (req: AuthRequest, res: Response) => {
  const tenantId = tenantOf(req);
  const conversation = await prisma.whatsAppConversation.findFirst({
    where: { id: param(req, 'id'), tenantId },
    select: { id: true, phoneNumber: true, bookingId: true },
  });
  if (!conversation) throw new NotFoundError('שיחת WhatsApp לא נמצאה.');

  const outcome = await queueWhatsAppMessage({
    kind: 'text',
    tenantId,
    toPhone: conversation.phoneNumber,
    bookingId: conversation.bookingId,
    body: (req.body as { body: string }).body,
    requestedBy: req.user?.email,
  });

  await setConversationStatus({ tenantId, conversationId: conversation.id, status: 'WaitingForCustomer' });

  res.status(202).json({ success: true, data: outcome });
});

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const listTemplatesHandler = catchAsync(async (req: AuthRequest, res: Response) => {
  const data = await listTemplates(tenantOf(req));
  res.json({ success: true, data });
});

export const upsertTemplateHandler = catchAsync(async (req: AuthRequest, res: Response) => {
  const tenantId = tenantOf(req);
  const body = req.body as Parameters<typeof upsertTemplate>[0];
  // metaStatus is never taken from the request — only Meta may set it (§33).
  const data = await upsertTemplate({ ...body, tenantId });

  logger.info('WhatsApp template saved', {
    tenantId,
    actor: req.user?.email,
    templateId: data.id,
    name: data.name,
  });
  res.json({ success: true, data });
});

export const deleteTemplateHandler = catchAsync(async (req: AuthRequest, res: Response) => {
  const tenantId = tenantOf(req);
  const count = await deleteTemplate({ tenantId, id: param(req, 'id') });
  if (count === 0) throw new NotFoundError('תבנית לא נמצאה.');
  logger.info('WhatsApp template deleted', {
    tenantId,
    actor: req.user?.email,
    templateId: param(req, 'id'),
  });
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Automations
// ---------------------------------------------------------------------------

export const listAutomations = catchAsync(async (req: AuthRequest, res: Response) => {
  const tenantId = tenantOf(req);
  const [rules, handlers] = await Promise.all([
    prisma.whatsAppAutomationRule.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      include: { template: { select: { id: true, name: true, language: true, metaStatus: true } } },
    }),
    Promise.resolve(listAutomationHandlers()),
  ]);
  res.json({ success: true, data: { rules, availableTriggers: handlers } });
});

export const createAutomation = catchAsync(async (req: AuthRequest, res: Response) => {
  const tenantId = tenantOf(req);
  const body = req.body as Record<string, unknown>;

  if (body.templateId) {
    const template = await prisma.whatsAppTemplate.findFirst({
      where: { id: body.templateId as string, tenantId },
      select: { id: true },
    });
    if (!template) throw new NotFoundError('תבנית לא נמצאה.');
  }

  const rule = await prisma.whatsAppAutomationRule.create({
    data: {
      tenantId,
      name: body.name as string,
      triggerType: body.triggerType as string,
      triggerConfiguration: (body.triggerConfiguration ?? undefined) as never,
      templateId: (body.templateId as string) ?? null,
      actionType: (body.actionType as string) ?? 'SendWhatsAppToCustomer',
      actionConfiguration: (body.actionConfiguration ?? undefined) as never,
      isEnabled: (body.isEnabled as boolean) ?? false,
    },
  });

  logger.info('WhatsApp automation rule created', {
    tenantId,
    actor: req.user?.email,
    ruleId: rule.id,
    triggerType: rule.triggerType,
    isEnabled: rule.isEnabled,
  });
  res.status(201).json({ success: true, data: rule });
});

export const updateAutomation = catchAsync(async (req: AuthRequest, res: Response) => {
  const tenantId = tenantOf(req);
  const body = req.body as Record<string, unknown>;

  const existing = await prisma.whatsAppAutomationRule.findFirst({
    where: { id: param(req, 'id'), tenantId },
    select: { id: true, isEnabled: true },
  });
  if (!existing) throw new NotFoundError('אוטומציה לא נמצאה.');

  const rule = await prisma.whatsAppAutomationRule.update({
    where: { id: existing.id },
    data: {
      name: (body.name as string) ?? undefined,
      triggerType: (body.triggerType as string) ?? undefined,
      triggerConfiguration: (body.triggerConfiguration ?? undefined) as never,
      templateId: body.templateId === undefined ? undefined : ((body.templateId as string) ?? null),
      actionType: (body.actionType as string) ?? undefined,
      actionConfiguration: (body.actionConfiguration ?? undefined) as never,
      isEnabled: (body.isEnabled as boolean) ?? undefined,
    },
  });

  // Enabling/disabling an automation changes what customers receive — always audited.
  logger.info('WhatsApp automation rule updated', {
    tenantId,
    actor: req.user?.email,
    ruleId: rule.id,
    wasEnabled: existing.isEnabled,
    isEnabled: rule.isEnabled,
  });
  res.json({ success: true, data: rule });
});

export const deleteAutomation = catchAsync(async (req: AuthRequest, res: Response) => {
  const tenantId = tenantOf(req);
  const result = await prisma.whatsAppAutomationRule.deleteMany({
    where: { id: param(req, 'id'), tenantId },
  });
  if (result.count === 0) throw new NotFoundError('אוטומציה לא נמצאה.');
  logger.info('WhatsApp automation rule deleted', {
    tenantId,
    actor: req.user?.email,
    ruleId: param(req, 'id'),
  });
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Settings / health
// ---------------------------------------------------------------------------

export const getSettings = catchAsync(async (req: AuthRequest, res: Response) => {
  // getWhatsAppHealth returns booleans about secrets, never the secrets (§13, §31).
  const data = await getWhatsAppHealth(tenantOf(req));
  res.json({ success: true, data });
});
