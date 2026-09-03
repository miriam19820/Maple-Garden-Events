/**
 * Local template registry (§33).
 *
 * A row here is LOCAL CONFIGURATION ONLY. Meta owns approval; `metaStatus` mirrors
 * what Meta told us and is never inferred from local state. Seeded/demo templates
 * are always created as `Draft` and are not sendable.
 */

import prisma from '../../config/prisma';
import { logger } from '../../utils/logger';
import { WhatsAppError } from './errors';
import type { TemplateCategory, TemplateMetaStatus } from './types';

export type TemplateParameterSpec = {
  /** Positional index in Meta's body component (1-based). */
  position: number;
  /** Field name for humans + the automation config UI, e.g. "customerName". */
  key: string;
  description?: string;
  example?: string;
};

/** The single gate every template send passes through. */
export async function assertTemplateSendable(params: {
  tenantId: string;
  name: string;
  language: string;
}): Promise<{ id: string; name: string; language: string }> {
  const template = await prisma.whatsAppTemplate.findUnique({
    where: {
      tenantId_name_language: {
        tenantId: params.tenantId,
        name: params.name,
        language: params.language,
      },
    },
  });

  if (!template) {
    throw new WhatsAppError(
      'TemplateNotFound',
      `No WhatsApp template "${params.name}" (${params.language}) is registered.`,
      { tenantId: params.tenantId },
    );
  }

  if (template.metaStatus !== ('Approved' satisfies TemplateMetaStatus)) {
    throw new WhatsAppError(
      'TemplateNotApproved',
      `Template "${params.name}" is not approved by Meta (status: ${template.metaStatus}).`,
      { tenantId: params.tenantId, metaStatus: template.metaStatus },
    );
  }

  return { id: template.id, name: template.name, language: template.language };
}

/**
 * Build Meta `components` from a parameter spec plus named values.
 * Only the body component is generated; header/button parameters can be passed
 * through by the caller when a template needs them.
 */
export function buildTemplateComponents(
  spec: TemplateParameterSpec[] | null | undefined,
  values: Record<string, string | number | null | undefined>,
): Record<string, unknown>[] {
  if (!spec?.length) return [];

  const ordered = [...spec].sort((a, b) => a.position - b.position);
  return [
    {
      type: 'body',
      parameters: ordered.map((param) => ({
        type: 'text',
        // Meta rejects empty parameters; an em dash keeps the message well-formed.
        text: String(values[param.key] ?? '—'),
      })),
    },
  ];
}

export async function listTemplates(tenantId: string) {
  return prisma.whatsAppTemplate.findMany({
    where: { tenantId },
    orderBy: [{ name: 'asc' }, { language: 'asc' }],
  });
}

export async function upsertTemplate(params: {
  tenantId: string;
  name: string;
  language: string;
  category?: TemplateCategory;
  bodyPreview?: string | null;
  parameters?: TemplateParameterSpec[] | null;
  metadata?: Record<string, unknown> | null;
}) {
  return prisma.whatsAppTemplate.upsert({
    where: {
      tenantId_name_language: {
        tenantId: params.tenantId,
        name: params.name,
        language: params.language,
      },
    },
    // metaStatus is deliberately absent from both branches: only syncTemplateMetaStatus
    // may change it, and only from information that came from Meta.
    create: {
      tenantId: params.tenantId,
      name: params.name,
      language: params.language,
      category: params.category ?? 'UTILITY',
      bodyPreview: params.bodyPreview ?? null,
      parameters: (params.parameters ?? undefined) as never,
      metadata: (params.metadata ?? undefined) as never,
      metaStatus: 'Draft',
    },
    update: {
      category: params.category ?? undefined,
      bodyPreview: params.bodyPreview ?? undefined,
      parameters: (params.parameters ?? undefined) as never,
      metadata: (params.metadata ?? undefined) as never,
      version: { increment: 1 },
    },
  });
}

/**
 * Apply an approval state that CAME FROM META (webhook `message_template_status_update`
 * or an explicit admin sync). Never call this from local UI state.
 */
export async function syncTemplateMetaStatus(params: {
  tenantId: string;
  name: string;
  language: string;
  metaStatus: TemplateMetaStatus;
  metaTemplateId?: string | null;
  reason?: string | null;
}): Promise<number> {
  const result = await prisma.whatsAppTemplate.updateMany({
    where: { tenantId: params.tenantId, name: params.name, language: params.language },
    data: {
      metaStatus: params.metaStatus,
      metaTemplateId: params.metaTemplateId ?? undefined,
      lastSyncedAt: new Date(),
      ...(params.reason ? { metadata: { rejectionReason: params.reason } as never } : {}),
    },
  });

  logger.info('WhatsApp template Meta status synced', {
    tenantId: params.tenantId,
    name: params.name,
    language: params.language,
    metaStatus: params.metaStatus,
    matched: result.count,
  });
  return result.count;
}

export async function deleteTemplate(params: { tenantId: string; id: string }): Promise<number> {
  const result = await prisma.whatsAppTemplate.deleteMany({
    where: { id: params.id, tenantId: params.tenantId },
  });
  return result.count;
}
