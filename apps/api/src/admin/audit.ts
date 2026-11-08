import type { Prisma, PrismaClient } from '@prisma/client';
import { badRequest } from '../http/errors';
import type { AdminPrincipal } from './auth';

/**
 * Every sensitive admin action writes one audit row: who, what, which entity, which country, and why.
 * `reason` is mandatory for the actions that move money or access (see REASON_REQUIRED) — enforced here,
 * so no route can forget it.
 */
export const REASON_REQUIRED = new Set([
  'access.grant', 'user.suspend', 'user.unsuspend', 'payment.manual_grant',
  'country.status.set', 'country.status.force_live', 'country.plan.set', 'country.payment_method.set',
  'admin.invite', 'admin.update', 'admin.deactivate', 'report.dismiss', 'mock_test.unpublish', 'demand.waiting_list.notify',
]);

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  countryCode?: string | null;
  reason?: string | null;
  /** Names and values that make the line readable on its own (the target user's name, old and new price …). */
  metadata?: Record<string, unknown>;
}

type Db = PrismaClient | Prisma.TransactionClient;

export async function writeAudit(db: Db, admin: Pick<AdminPrincipal, 'id'> | null, e: AuditEntry) {
  const reason = e.reason?.trim() || null;
  if (REASON_REQUIRED.has(e.action) && !reason) throw badRequest('reason_required');
  return db.auditLog.create({
    data: {
      actorId: admin?.id ?? null,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      countryCode: e.countryCode ?? null,
      reason,
      metadata: (e.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

/** A sentence for the audit list, in the style of the design ("granted Full Access to Olivier Kayitare — reason: …"). */
export function describeAudit(e: { action: string; reason: string | null; metadata: unknown; entityId: string | null }): string {
  const m = (e.metadata ?? {}) as Record<string, unknown>;
  const s = (k: string) => (m[k] === undefined || m[k] === null ? '' : String(m[k]));
  const why = e.reason ? ` — reason: ${e.reason}` : '';
  switch (e.action) {
    case 'access.grant': return `granted ${s('days')} days of Full Access to ${s('targetName')}${why}`;
    case 'user.suspend': return `suspended ${s('targetName')}${why}`;
    case 'user.unsuspend': return `lifted the suspension of ${s('targetName')}${why}`;
    case 'password.reset_sent': return `sent a password reset link to ${s('targetEmail')}`;
    case 'otp.resend': return `sent a login code to ${s('targetEmail')}`;
    case 'payment.check': return `checked a payment (${s('result')})`;
    case 'payment.manual_grant': return `granted access for payment ${s('reference')} (transaction ${s('transactionId')})${why}`;
    case 'country.plan.set': return `changed the ${s('country')} Full Access price from ${s('from')} to ${s('to')}${why}`;
    case 'country.status.set': return `moved ${s('country')} from ${s('from')} to ${s('to')}${why}`;
    case 'country.status.force_live': return `forced ${s('country')} live despite an incomplete checklist${why}`;
    case 'country.payment_method.set': return `set ${s('label')} in ${s('country')} to ${s('to')}${why}`;
    case 'mock_test.publish': return `published ${s('title')}`;
    case 'mock_test.archive': return `archived ${s('title')}`;
    case 'mock_test.unpublish': return `unpublished ${s('title')}${why}`;
    case 'mock_test.restore': return `restored ${s('title')} as a draft`;
    case 'mock_test.delete': return `permanently deleted ${s('title')}${why}`;
    case 'mock_test.duplicate': return `copied ${s('title')} as ${s('copyTitle')}`;
    case 'question.reorder': return `reordered the questions of ${s('title')}`;
    case 'question.translate': return `saved the ${s('language')} translation of a question in ${s('title')}`;
    case 'question.translate_delete': return `removed the ${s('language')} translation of a question in ${s('title')}`;
    case 'case.translate': return `saved the ${s('language')} translation of the case study ${s('name')}`;
    case 'case.translate_delete': return `removed the ${s('language')} translation of the case study ${s('name')}`;
    case 'case.attach': return `attached ${s('count')} question(s) to the case study ${s('name')}`;
    case 'case.detach': return `detached ${s('count')} question(s) from the case study ${s('name')}`;
    case 'category.reorder': return `reordered the categories of ${s('country')}`;
    case 'section.reorder': return `reordered the sections of ${s('title')}`;
    case 'report.close_all': return `closed ${s('count')} report(s) on a question in ${s('title')} as ${s('status').toLowerCase()}${why}`;
    case 'user.view_as_candidate': return `viewed ${s('targetName')}'s account as the candidate sees it (read only)`;
    case 'country.support.set': return `changed the support contact of ${s('country')}`;
    case 'legal.update': return `saved the ${s('page')} page (${s('scope')})`;
    case 'legal.reset': return `restored the placeholder ${s('page')} page (${s('scope')})`;
    case 'demand.exam_request.done': return `marked the exam request "${s('query')}" done (${s('marked')} request(s), ${s('notified')} notified)${why}`;
    case 'demand.waiting_list.notify': return `told ${s('notified')} people on the ${s('country')} waiting list that it is open${why}`;
    case 'audit.export': return `exported ${s('rows')} audit rows`;
    case 'export.payments': return `exported ${s('rows')} payments for accounting`;
    case 'export.waiting_list': return `exported the ${s('country')} waiting list (${s('rows')} rows)`;
    case 'mock_test.create': return `created ${s('title')}`;
    case 'mock_test.update': return `edited ${s('title')}`;
    case 'question.update': return `edited a question in ${s('title')}`;
    case 'question.create': return `added a question to ${s('title')}`;
    case 'question.archive': return `archived a question in ${s('title')}`;
    case 'csv.import': return `imported ${s('created')} questions into ${s('title')}`;
    case 'report.resolve': return `resolved a report on ${s('title')}`;
    case 'report.dismiss': return `dismissed a report on ${s('title')}`;
    case 'admin.invite': return `invited ${s('name')} as ${s('role')}${why}`;
    case 'admin.update': return `changed ${s('name')}: ${s('change')}${why}`;
    case 'admin.deactivate': return `deactivated ${s('name')}${why}`;
    case 'settings.update': return `changed the setting ${s('key')} from ${s('from')} to ${s('to')}`;
    default: return e.action.replace('.', ' ') + why;
  }
}
