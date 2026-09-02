import type { Prisma } from "@prisma/client";
import type { SupportCaseDetailDto, SupportCaseSummaryDto, SupportMessageDto } from "@petlife/types";

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
