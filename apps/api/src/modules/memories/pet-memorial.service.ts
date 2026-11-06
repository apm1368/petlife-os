import { Injectable } from "@nestjs/common";
import { HouseholdRole, PetLifecycleStatus, PetMemorialStatus, PetMemoryType, PetMemoryVisibility, Prisma } from "@prisma/client";
import { HouseholdAccessDeniedException, NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { PrismaService } from "../../common/prisma/prisma.service";
import { resolveObjectUrls } from "../storage/object-url.util";

export const PET_MEMORIAL_CONSENT_VERSION = "public-pet-memorial-v1";

export interface SubmitPetMemorialInput {
  displayName: string;
  imageMemoryId: string;
  consent: boolean;
}

@Injectable()
export class PetMemorialService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireOwner(petId: string, userId: string) {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId }, select: { id: true, name: true, householdId: true, lifecycleStatus: true } });
    if (!pet) throw new NotFoundApiException("Pet", { petId });
    const membership = await this.prisma.householdMember.findUnique({ where: { householdId_userId: { householdId: pet.householdId, userId } }, select: { role: true } });
    if (membership?.role !== HouseholdRole.OWNER) throw new HouseholdAccessDeniedException({ reason: "PET_MEMORIAL_OWNER_REQUIRED" });
    if (pet.lifecycleStatus !== PetLifecycleStatus.DECEASED && pet.lifecycleStatus !== PetLifecycleStatus.MEMORIAL) {
      throw new ValidationApiException({ field: "pet.lifecycleStatus", reason: "PET_MUST_BE_RECORDED_AS_DECEASED" });
    }
    return pet;
  }

  async getForOwner(petId: string, userId: string) {
    await this.requireOwner(petId, userId);
    const row = await this.prisma.petMemorialSubmission.findFirst({ where: { petId, ownerUserId: userId }, orderBy: { createdAt: "desc" }, select: { id: true, displayName: true, status: true, consentedAt: true, submittedAt: true, reviewedAt: true, reviewReason: true, withdrawnAt: true } });
    return row ? { ...row, consentedAt: row.consentedAt.toISOString(), submittedAt: row.submittedAt.toISOString(), reviewedAt: row.reviewedAt?.toISOString() ?? null, withdrawnAt: row.withdrawnAt?.toISOString() ?? null } : null;
  }

  async submit(petId: string, userId: string, input: SubmitPetMemorialInput) {
    await this.requireOwner(petId, userId);
    if (input.consent !== true) throw new ValidationApiException({ field: "consent", reason: "EXPLICIT_PUBLIC_CONSENT_REQUIRED" });
    const displayName = input.displayName.trim();
    if (displayName.length < 1 || displayName.length > 120) throw new ValidationApiException({ field: "displayName", reason: "LENGTH_MUST_BE_1_TO_120" });
    const memory = await this.prisma.petMemory.findFirst({
      where: { id: input.imageMemoryId, petId, type: PetMemoryType.PHOTO, visibility: PetMemoryVisibility.PUBLIC, archivedAt: null },
      select: { id: true, mediaObjectKeys: true },
    });
    const imageObjectKey = memory?.mediaObjectKeys.find((key) => key.startsWith(`pet-memories-public/${petId}/`));
    if (!memory || !imageObjectKey) throw new ValidationApiException({ field: "imageMemoryId", reason: "SELECT_A_NON_ARCHIVED_PUBLIC_PHOTO_FOR_THIS_PET" });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.petMemorialSubmission.create({ data: {
          petId,
          ownerUserId: userId,
          displayName,
          imageMemoryId: memory.id,
          imageObjectKey,
          consentVersion: PET_MEMORIAL_CONSENT_VERSION,
          consentedAt: new Date(),
          status: PetMemorialStatus.PENDING_REVIEW,
        } });
        await tx.petMemorialAuditEvent.create({ data: { submissionId: created.id, actorUserId: userId, action: "OWNER_CONSENT_SUBMITTED", toStatus: PetMemorialStatus.PENDING_REVIEW } });
        return { id: created.id, displayName: created.displayName, status: created.status, consentedAt: created.consentedAt.toISOString(), submittedAt: created.submittedAt.toISOString(), reviewedAt: null, reviewReason: null, withdrawnAt: null };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ValidationApiException({ field: "memorial", reason: "ACTIVE_SUBMISSION_ALREADY_EXISTS" });
      }
      throw error;
    }
  }

  async withdraw(petId: string, userId: string) {
    await this.requireOwner(petId, userId);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.petMemorialSubmission.findFirst({ where: { petId, ownerUserId: userId, status: { in: [PetMemorialStatus.PENDING_REVIEW, PetMemorialStatus.PUBLISHED] }, withdrawnAt: null }, orderBy: { createdAt: "desc" } });
      if (!current) return { withdrawn: false };
      const now = new Date();
      const changed = await tx.petMemorialSubmission.updateMany({ where: { id: current.id, status: current.status, withdrawnAt: null }, data: { status: PetMemorialStatus.WITHDRAWN, withdrawnAt: now } });
      if (changed.count !== 1) throw new ValidationApiException({ field: "memorial", reason: "CHANGED_CONCURRENTLY" });
      await tx.petMemorialAuditEvent.create({ data: { submissionId: current.id, actorUserId: userId, action: "OWNER_WITHDREW_CONSENT", fromStatus: current.status, toStatus: PetMemorialStatus.WITHDRAWN } });
      return { withdrawn: true };
    });
  }

  async listPublic() {
    const rows = await this.prisma.petMemorialSubmission.findMany({
      where: {
        status: PetMemorialStatus.PUBLISHED,
        withdrawnAt: null,
        pet: { lifecycleStatus: { in: [PetLifecycleStatus.DECEASED, PetLifecycleStatus.MEMORIAL] } },
        imageMemory: { is: { type: PetMemoryType.PHOTO, visibility: PetMemoryVisibility.PUBLIC, archivedAt: null } },
      },
      select: { id: true, displayName: true, imageObjectKey: true, publishedAt: true, imageMemory: { select: { mediaObjectKeys: true } } },
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
      take: 12,
    });
    return rows.flatMap((row) => {
      const imageUrl = `/public/pet-memorials/${row.id}/image`;
      return imageUrl && row.imageMemory.mediaObjectKeys.includes(row.imageObjectKey) ? [{ id: row.id, name: row.displayName, imageUrl }] : [];
    });
  }

  async getPublishedImageUrl(submissionId: string) {
    const row = await this.prisma.petMemorialSubmission.findFirst({
      where: {
        id: submissionId,
        status: PetMemorialStatus.PUBLISHED,
        withdrawnAt: null,
        pet: { lifecycleStatus: { in: [PetLifecycleStatus.DECEASED, PetLifecycleStatus.MEMORIAL] } },
        imageMemory: { is: { type: PetMemoryType.PHOTO, visibility: PetMemoryVisibility.PUBLIC, archivedAt: null } },
      },
      select: { imageObjectKey: true, imageMemory: { select: { mediaObjectKeys: true } } },
    });
    if (!row || !row.imageMemory.mediaObjectKeys.includes(row.imageObjectKey)) throw new NotFoundApiException("Pet memorial", { submissionId });
    return resolveObjectUrls([row.imageObjectKey])[0] ?? null;
  }
}
