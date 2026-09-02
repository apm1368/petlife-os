import type { Prisma } from "@prisma/client";
import type { DisputeDto, DisputeEvidenceDto } from "@petlife/types";

export type DisputeWithRelations = Prisma.DisputeGetPayload<{
  include: { assignedAdmin: { include: { user: true } }; evidence: { include: { actorUser: true; actorAdmin: { include: { user: true } } } } };
}>;

type DisputeEvidenceWithRelations = Prisma.DisputeEvidenceGetPayload<{ include: { actorUser: true; actorAdmin: { include: { user: true } } } }>;

export function toDisputeEvidenceDto(e: DisputeEvidenceWithRelations): DisputeEvidenceDto {
  return {
    id: e.id,
    disputeId: e.disputeId,
    actorType: e.actorType as never,
    actor: e.actorAdmin
      ? { id: e.actorAdmin.id, displayName: e.actorAdmin.user.displayName, role: e.actorAdmin.role as never }
      : e.actorUser
        ? { id: e.actorUser.id, displayName: e.actorUser.displayName }
        : null,
    statement: e.statement,
    attachmentRef: e.attachmentRef,
    createdAt: e.createdAt.toISOString(),
  };
}

export function toDisputeDto(row: DisputeWithRelations): DisputeDto {
  return {
    id: row.id,
    subjectType: row.subjectType as never,
    subjectId: row.subjectId,
    raisedByUserId: row.raisedByUserId,
    supportCaseId: row.supportCaseId,
    claim: row.claim,
    status: row.status as never,
    assignedAdmin: row.assignedAdmin ? { id: row.assignedAdmin.id, displayName: row.assignedAdmin.user.displayName, role: row.assignedAdmin.role as never } : null,
    resolutionSummary: row.resolutionSummary,
    evidence: row.evidence.map(toDisputeEvidenceDto),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
  };
}
