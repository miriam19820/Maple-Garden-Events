import { z } from 'zod';
import {
  AUTOMATION_ACTIONS,
  AUTOMATION_TRIGGERS,
  CONVERSATION_STATUSES,
  TEMPLATE_CATEGORIES,
} from '../Services/whatsapp/types';

const uuid = z.string().uuid();
const idParam = (key: string) => z.object({ [key]: uuid });

export const listConversationsSchema = z.object({
  query: z.object({
    status: z.enum(CONVERSATION_STATUSES).optional(),
    assignedUserId: uuid.optional(),
    /** Free-text phone fragment; normalised server-side. */
    phone: z.string().trim().max(32).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const conversationIdSchema = z.object({ params: idParam('id') });

export const listMessagesSchema = z.object({
  params: idParam('id'),
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  }),
});

export const assignConversationSchema = z.object({
  params: idParam('id'),
  body: z.object({
    assignedUserId: uuid.nullable(),
  }),
});

export const updateConversationStatusSchema = z.object({
  params: idParam('id'),
  body: z.object({
    status: z.enum(CONVERSATION_STATUSES),
  }),
});

/** Outgoing message. Media/documents are referenced, never uploaded as raw base64 here. */
export const sendMessageSchema = z.object({
  body: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('text'),
      toPhone: z.string().trim().min(6).max(32),
      bookingId: uuid.optional(),
      body: z.string().trim().min(1).max(4096),
    }),
    z.object({
      kind: z.literal('template'),
      toPhone: z.string().trim().min(6).max(32),
      bookingId: uuid.optional(),
      templateName: z.string().trim().min(1).max(512),
      languageCode: z.string().trim().min(2).max(10).optional(),
      parameters: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    }),
    z.object({
      kind: z.literal('document'),
      toPhone: z.string().trim().min(6).max(32),
      bookingId: uuid.optional(),
      filename: z.string().trim().min(1).max(255),
      link: z.string().url().max(2048).optional(),
      mediaId: z.string().trim().max(128).optional(),
      caption: z.string().trim().max(1024).optional(),
    }),
  ]),
});

export const sendInConversationSchema = z.object({
  params: idParam('id'),
  body: z.object({
    body: z.string().trim().min(1).max(4096),
  }),
});

export const listTemplatesSchema = z.object({ query: z.object({}).passthrough() });

export const upsertTemplateSchema = z.object({
  body: z.object({
    // Meta template names: lowercase letters, digits and underscores only.
    name: z.string().trim().regex(/^[a-z0-9_]{1,512}$/, 'template_name_invalid'),
    language: z.string().trim().min(2).max(10).default('he'),
    category: z.enum(TEMPLATE_CATEGORIES).optional(),
    bodyPreview: z.string().max(4096).nullable().optional(),
    parameters: z
      .array(
        z.object({
          position: z.number().int().min(1).max(20),
          key: z.string().trim().min(1).max(64),
          description: z.string().max(256).optional(),
          example: z.string().max(256).optional(),
        }),
      )
      .nullable()
      .optional(),
  }),
});

export const templateIdSchema = z.object({ params: idParam('id') });

export const listAutomationsSchema = z.object({ query: z.object({}).passthrough() });

export const createAutomationSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(120),
    triggerType: z.enum(AUTOMATION_TRIGGERS),
    triggerConfiguration: z.record(z.string(), z.unknown()).nullable().optional(),
    templateId: uuid.nullable().optional(),
    actionType: z.enum(AUTOMATION_ACTIONS).optional(),
    actionConfiguration: z.record(z.string(), z.unknown()).nullable().optional(),
    isEnabled: z.boolean().optional(),
  }),
});

export const updateAutomationSchema = z.object({
  params: idParam('id'),
  body: createAutomationSchema.shape.body.partial(),
});
