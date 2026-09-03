import { Injectable } from "@nestjs/common";
import { SourceType } from "@prisma/client";
import type { MedicalDocumentDownloadDto, MedicalDocumentDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { MedicalDocumentNotFoundException, NotFoundApiException } from "../../common/errors/api-exception";
import { EntitlementService } from "../subscriptions/entitlement.service";
import { StorageService } from "../storage/storage.service";
import type { UploadTarget } from "../storage/storage-driver.interface";
import { MEDICAL_DOCUMENT_INCLUDE, toMedicalDocumentDto } from "./clinical-health-mapper";
import type { CreateMedicalDocumentDto, RequestMedicalDocumentUploadDto } from "./dto/medical-document.dto";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";

export interface DocumentActor {
  sourceType: SourceType;
  sourceUserId?: string;
  provider?: ResolvedProviderContext;
}

/**
 * Handoff 17 core model — see the schema.prisma section-level doc comment
 * for the full provenance/immutability rationale. Every document is private
 * by default (visibility HOUSEHOLD_ONLY) and stored under a private key
 * prefix; a download URL is minted fresh per request, never cached.
 */
@Injectable()
export class MedicalDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly events: DomainEventsService,
    private readonly entitlements: EntitlementService,
  ) {}

  async requestUpload(petId: string, dto: RequestMedicalDocumentUploadDto): Promise<UploadTarget & { key: string }> {
    return this.storage.createHealthDocumentUploadTarget(petId, dto.contentType, dto.fileSizeBytes);
  }

  async create(petId: string, actor: DocumentActor, dto: CreateMedicalDocumentDto): Promise<MedicalDocumentDto> {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) throw new NotFoundApiException("Pet");

    // spec: "New premium creation/actions may be gated... never hide
    // safety-critical information behind subscription." Only the OWNER
    // upload path is metered — a provider's clinical upload (e.g. a
    // discharge summary) must never be blocked by the household's own plan.
    if (!actor.provider) {
      await this.entitlements.assertWithinLimit(pet.householdId, "health.documents.max");
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.medicalDocument.create({
        data: {
          petId,
          householdId: pet.householdId,
          documentType: dto.documentType as never,
          title: dto.title,
          description: dto.description,
          sourceType: actor.sourceType,
          sourceUserId: actor.sourceUserId,
          sourceProviderOrganizationId: actor.provider?.organizationId,
          sourceProviderUserId: actor.provider?.providerUserId,
          // A PROVIDER-sourced document is verified by construction — the
          // organization stands behind its own record (see the doc comment
          // on DocumentVerificationStatus). OWNER uploads stay UNVERIFIED.
          verificationStatus: actor.provider ? "PROVIDER_VERIFIED" : "UNVERIFIED",
          recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : undefined,
          fileObjectKey: dto.key,
          mimeType: dto.mimeType,
          fileSizeBytes: dto.fileSizeBytes,
          relatedVisitId: dto.relatedVisitId,
          relatedLabResultId: dto.relatedLabResultId,
          relatedImagingStudyId: dto.relatedImagingStudyId,
          relatedReferralId: dto.relatedReferralId,
        },
        include: MEDICAL_DOCUMENT_INCLUDE,
      });
      await this.events.publish(
        "MedicalDocumentAdded",
        { petId, documentId: created.id, documentType: created.documentType, sourceType: created.sourceType },
        { tx, aggregateType: "Pet", aggregateId: petId },
      );
      return created;
    });
    return toMedicalDocumentDto(row);
  }

  async list(petId: string): Promise<MedicalDocumentDto[]> {
    const rows = await this.prisma.medicalDocument.findMany({
      where: { petId, voidedAt: null },
      include: MEDICAL_DOCUMENT_INCLUDE,
      orderBy: { uploadedAt: "desc" },
    });
    return rows.map(toMedicalDocumentDto);
  }

  async get(petId: string, documentId: string) {
    const row = await this.prisma.medicalDocument.findUnique({ where: { id: documentId }, include: MEDICAL_DOCUMENT_INCLUDE });
    if (!row || row.petId !== petId) throw new MedicalDocumentNotFoundException({ documentId });
    return row;
  }

  async getDto(petId: string, documentId: string): Promise<MedicalDocumentDto> {
    return toMedicalDocumentDto(await this.get(petId, documentId));
  }

  /** Mints a short-TTL signed download URL — the CALLER (controller, via PetAccessGuard) has already verified viewing authorization before this runs. */
  async getDownload(petId: string, documentId: string): Promise<MedicalDocumentDownloadDto> {
    const row = await this.get(petId, documentId);
    return this.storage.createPrivateDownloadTarget(row.fileObjectKey);
  }

  /**
   * The only way to retract a document — never a hard delete (spec:
   * "provider-originated clinical records must not be silently
   * overwritten"). Applies equally to owner-uploaded documents: a mistaken
   * upload is voided, not erased, preserving the audit trail.
   */
  async voidDocument(petId: string, documentId: string, reason: string): Promise<MedicalDocumentDto> {
    const existing = await this.get(petId, documentId);
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.medicalDocument.update({
        where: { id: existing.id },
        data: { voidedAt: new Date(), voidedReason: reason },
        include: MEDICAL_DOCUMENT_INCLUDE,
      });
      await this.events.publish("MedicalDocumentVoided", { petId, documentId }, { tx, aggregateType: "Pet", aggregateId: petId });
      return updated;
    });
    return toMedicalDocumentDto(row);
  }
}
