import type { Prisma } from "@prisma/client";
import { SupportCaseStatus } from "@prisma/client";
import { UserFacingSupportCaseStatus, type SupportCaseDetailDto, type SupportCaseSummaryDto, type SupportCaseUserDetailDto, type SupportCaseUserSummaryDto, type SupportMessageDto } from "@petlife/types";

export type SupportCaseWithRelations = Prisma.SupportCaseGetPayload<{ include: { assignedAdmin: { include: { user: true } }; requesterUser: true } }>;

export function toSupportCaseSummaryDto(row: SupportCaseWithRelations): SupportCaseSummaryDto {
  return {
    id: row.id,
    caseNumber: row.caseNumber,
    requesterUserId: row.requesterUserId,
    requesterDisplayName: row.requesterUser.displayName,
    householdId: row.householdId,
    petId: row.petId,
    subject: row.subject,
    category: row.category as never,
    priority: row.priority as never,
    status: row.status as never,
    assignedAdmin: row.assignedAdmin ? { id: row.assignedAdmin.id, displayName: row.assignedAdmin.user.displayName, role: row.assignedAdmin.role as never } : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
  };
}

type SupportMessageWithRelations = Prisma.SupportMessageGetPayload<{ include: { authorUser: true; authorAdmin: { include: { user: true } } } }>;

export function toSupportMessageDto(row: SupportMessageWithRelations): SupportMessageDto {
  return {
    id: row.id,
    caseId: row.caseId,
    authorType: row.authorType as never,
    author: row.authorAdmin ? { id: row.authorAdmin.id, displayName: row.authorAdmin.user.displayName, role: row.authorAdmin.role as never } : row.authorUser ? { id: row.authorUser.id, displayName: row.authorUser.displayName } : null,
    body: row.body,
    visibility: row.visibility as never,
    createdAt: row.createdAt.toISOString(),
  };
}

export type SupportCaseDetailWithRelations = SupportCaseWithRelations & {
  createdByAdmin: Prisma.AdminUserGetPayload<{ include: { user: true } }> | null;
};

export function toSupportCaseDetailDto(row: SupportCaseDetailWithRelations, messages: SupportMessageDto[], internalNotes: SupportCaseDetailDto["internalNotes"]): SupportCaseDetailDto {
  return {
    ...toSupportCaseSummaryDto(row),
    description: row.description,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    createdByAdmin: row.createdByAdmin ? { id: row.createdByAdmin.id, displayName: row.createdByAdmin.user.displayName, role: row.createdByAdmin.role as never } : null,
    messages,
    internalNotes,
  };
}

/**
 * OPEN/IN_PROGRESS/WAITING_ON_INTERNAL all read as "we're on it" to a user —
 * only WAITING_ON_USER (we need something from them) gets its own label.
 * See UserFacingSupportCaseStatus's doc comment in @petlife/types.
 */
function toUserFacingStatus(status: SupportCaseStatus): UserFacingSupportCaseStatus {
  switch (status) {
    case SupportCaseStatus.OPEN:
      return UserFacingSupportCaseStatus.SUBMITTED;
    case SupportCaseStatus.WAITING_ON_USER:
      return UserFacingSupportCaseStatus.WAITING;
    case SupportCaseStatus.RESOLVED:
      return UserFacingSupportCaseStatus.RESOLVED;
    case SupportCaseStatus.CLOSED:
      return UserFacingSupportCaseStatus.CLOSED;
    case SupportCaseStatus.IN_PROGRESS:
    case SupportCaseStatus.WAITING_ON_INTERNAL:
    default:
      return UserFacingSupportCaseStatus.UNDER_REVIEW;
  }
}

/**
 * The consumer-facing summary mapper. Deliberately built from scratch
 * rather than derived from toSupportCaseSummaryDto — it must never pick up
 * priority/assignedAdmin/requesterDisplayName if those fields are ever
 * added to the admin summary shape later.
 */
export function toSupportCaseUserSummaryDto(row: SupportCaseWithRelations): SupportCaseUserSummaryDto {
  return {
    id: row.id,
    caseNumber: row.caseNumber,
    subject: row.subject,
    category: row.category as never,
    status: toUserFacingStatus(row.status),
    householdId: row.householdId,
    petId: row.petId,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
  };
}

/**
 * `messages` must already be filtered to PUBLIC-visibility rows by the
 * caller's query — this mapper does not re-check visibility, so it must
 * never be handed a message list that included an INTERNAL row.
 */
export function toSupportCaseUserDetailDto(row: SupportCaseWithRelations & { description: string }, messages: SupportMessageDto[]): SupportCaseUserDetailDto {
  return {
    ...toSupportCaseUserSummaryDto(row),
    description: row.description,
    messages,
  };
}
