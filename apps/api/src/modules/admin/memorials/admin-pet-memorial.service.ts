import { Injectable } from "@nestjs/common";
import { PetLifecycleStatus, PetMemorialStatus, PetMemoryType, PetMemoryVisibility, Prisma } from "@prisma/client";
import { NotFoundApiException, ValidationApiException } from "../../../common/errors/api-exception";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { resolveObjectUrls } from "../../storage/object-url.util";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { AdminAuditAction } from "../audit/admin-audit-action";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

const PAGE_SIZE = 30;

@Injectable()
export class AdminPetMemorialService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AdminAuditLogService) {}

  async list(status: PetMemorialStatus = PetMemorialStatus.PENDING_REVIEW, page = 1) {
    const safePage = Math.max(1, Math.min(1000, page));
    const where: Prisma.PetMemorialSubmissionWhereInput = { status };
    const [rows, total] = await Promise.all([
      this.prisma.petMemorialSubmission.findMany({
        where,
        include: { pet: { select: { id: true, name: true, lifecycleStatus: true } } },
        orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
        skip: (safePage - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.petMemorialSubmission.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        petId: row.pet.id,
        petName: row.pet.name,
        displayName: row.displayName,
        lifecycleStatus: row.pet.lifecycleStatus,
        status: row.status,
        consentVersion: row.consentVersion,
        consentedAt: row.consentedAt.toISOString(),
        submittedAt: row.submittedAt.toISOString(),
        imageUrl: resolveObjectUrls([row.imageObjectKey])[0] ?? null,
      })),
      total,
      page: safePage,
      pageSize: PAGE_SIZE,
    };
  }

  async review(admin: ResolvedAdminContext, id: string, action: "APPROVE" | "REJECT", reason: string, requestId?: string) {
    const note = reason.trim();
    if (note.length < 3 || note.length > 1000) throw new ValidationApiException({ field: "reason", reason: "LENGTH_MUST_BE_3_TO_1000" });
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.petMemorialSubmission.findUnique({ where: { id }, include: { pet: { select: { lifecycleStatus: true } }, imageMemory: { select: { type: true, visibility: true, archivedAt: true, mediaObjectKeys: true } } } });
      if (!current) throw new NotFoundApiException("Pet memorial submission", { id });
      if (current.status !== PetMemorialStatus.PENDING_REVIEW) throw new ValidationApiException({ field: "status", reason: "SUBMISSION_NOT_PENDING" });
      const approved = action === "APPROVE";
      if (approved && (!current.consentedAt || current.withdrawnAt || current.imageMemory.type !== PetMemoryType.PHOTO || current.imageMemory.visibility !== PetMemoryVisibility.PUBLIC || current.imageMemory.archivedAt || !current.imageMemory.mediaObjectKeys.includes(current.imageObjectKey) || (current.pet.lifecycleStatus !== PetLifecycleStatus.DECEASED && current.pet.lifecycleStatus !== PetLifecycleStatus.MEMORIAL))) {
        throw new ValidationApiException({ field: "submission", reason: "CONSENT_IMAGE_OR_LIFECYCLE_NO_LONGER_VALID" });
      }
      const nextStatus = approved ? PetMemorialStatus.PUBLISHED : PetMemorialStatus.REJECTED;
      const now = new Date();
      const moved = await tx.petMemorialSubmission.updateMany({
        where: { id, status: PetMemorialStatus.PENDING_REVIEW, withdrawnAt: null },
        data: { status: nextStatus, reviewedByAdminId: admin.adminUserId, reviewedAt: now, reviewReason: note, publishedAt: approved ? now : null },
      });
      if (moved.count !== 1) throw new ValidationApiException({ field: "status", reason: "CHANGED_CONCURRENTLY" });
      await tx.petMemorialAuditEvent.create({ data: { submissionId: id, actorAdminId: admin.adminUserId, action: approved ? "ADMIN_APPROVED" : "ADMIN_REJECTED", fromStatus: current.status, toStatus: nextStatus, reason: note } });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: (approved ? "pet_memorial.approved" : "pet_memorial.rejected") satisfies AdminAuditAction,
        entityType: "PET_MEMORIAL_SUBMISSION",
        entityId: id,
        reason: note,
        beforeSummary: { status: current.status },
        afterSummary: { status: nextStatus },
        requestId,
        tx,
      });
      return { id, status: nextStatus, reviewedAt: now.toISOString() };
    });
  }
}
