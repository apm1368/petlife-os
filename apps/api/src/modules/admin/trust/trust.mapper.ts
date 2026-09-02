import type { Prisma } from "@prisma/client";
import type { AppealDto, TrustActionDto, TrustCaseDto } from "@petlife/types";

type AppealWithRelations = Prisma.AppealGetPayload<{ include: { reviewerAdmin: { include: { user: true } } } }>;

export function toAppealDto(row: AppealWithRelations): AppealDto {
  return {
    id: row.id,
    trustActionId: row.trustActionId,
    appellantUserId: row.appellantUserId,
    reason: row.reason,
    status: row.status as never,
    resolution: row.resolution,
    reviewerAdmin: row.reviewerAdmin ? { id: row.reviewerAdmin.id, displayName: row.reviewerAdmin.user.displayName, role: row.reviewerAdmin.role as never } : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

type TrustActionWithRelations = Prisma.TrustActionGetPayload<{ include: { performedByAdmin: { include: { user: true } }; appeal: { include: { reviewerAdmin: { include: { user: true } } } } } }>;

export function toTrustActionDto(row: TrustActionWithRelations): TrustActionDto {
  return {
    id: row.id,
    trustCaseId: row.trustCaseId,
    actionType: row.actionType as never,
    reason: row.reason,
    performedByAdmin: { id: row.performedByAdmin.id, displayName: row.performedByAdmin.user.displayName, role: row.performedByAdmin.role as never },
    createdAt: row.createdAt.toISOString(),
    appeal: row.appeal ? toAppealDto(row.appeal) : null,
  };
}

export type TrustCaseWithRelations = Prisma.TrustCaseGetPayload<{
  include: {
    assignedAdmin: { include: { user: true } };
    openedByAdmin: { include: { user: true } };
    actions: { include: { performedByAdmin: { include: { user: true } }; appeal: { include: { reviewerAdmin: { include: { user: true } } } } } };
  };
}>;

export function toTrustCaseDto(row: TrustCaseWithRelations): TrustCaseDto {
  return {
    id: row.id,
    subjectType: row.subjectType as never,
    subjectId: row.subjectId,
    reason: row.reason,
    severity: row.severity as never,
    status: row.status as never,
    assignedAdmin: row.assignedAdmin ? { id: row.assignedAdmin.id, displayName: row.assignedAdmin.user.displayName, role: row.assignedAdmin.role as never } : null,
    openedByAdmin: { id: row.openedByAdmin.id, displayName: row.openedByAdmin.user.displayName, role: row.openedByAdmin.role as never },
    actions: row.actions.map(toTrustActionDto),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
  };
}
