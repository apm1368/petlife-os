import { Injectable } from "@nestjs/common";
import type { MedicalRecordCorrectionDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { MedicalRecordCorrectionNotFoundException } from "../../common/errors/api-exception";
import { toMedicalRecordCorrectionDto } from "./clinical-health-mapper";
import type { CreateMedicalRecordCorrectionDto, ResolveMedicalRecordCorrectionDto } from "./dto/correction.dto";

/**
 * spec: "Original provider record + Owner correction/annotation + Correction
 * history." Never edits or deletes the original record it targets — see the
 * doc comment on the MedicalRecordCorrection model. Available for CONDITION/
 * ALLERGY/MEDICATION/VACCINATION_SUMMARY (Handoff 02 rows, now blocked from
 * direct owner edit when PROVIDER-sourced — see provenance.util.ts) and
 * LAB_RESULT/IMAGING_STUDY/MEDICAL_DOCUMENT/CLINICAL_VISIT (Handoff 17).
 */
@Injectable()
export class MedicalRecordCorrectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async create(petId: string, userId: string, dto: CreateMedicalRecordCorrectionDto): Promise<MedicalRecordCorrectionDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.medicalRecordCorrection.create({
        data: { petId, targetType: dto.targetType as never, targetId: dto.targetId, correctionText: dto.correctionText, createdByUserId: userId },
      });
      await this.events.publish(
        "MedicalRecordCorrectionAdded",
        { petId, correctionId: created.id, targetType: created.targetType, targetId: created.targetId },
        { tx, aggregateType: "Pet", aggregateId: petId },
      );
      return created;
    });
    return toMedicalRecordCorrectionDto(row);
  }

  async list(petId: string): Promise<MedicalRecordCorrectionDto[]> {
    const rows = await this.prisma.medicalRecordCorrection.findMany({ where: { petId }, orderBy: { createdAt: "desc" } });
    return rows.map(toMedicalRecordCorrectionDto);
  }

  /** For a specific record — how the UI shows "original + corrections" side by side. */
  async listForTarget(petId: string, targetType: string, targetId: string): Promise<MedicalRecordCorrectionDto[]> {
    const rows = await this.prisma.medicalRecordCorrection.findMany({
      where: { petId, targetType: targetType as never, targetId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toMedicalRecordCorrectionDto);
  }

  /** Provider acknowledgement / resolution — still never mutates the original record. */
  async resolve(petId: string, correctionId: string, dto: ResolveMedicalRecordCorrectionDto): Promise<MedicalRecordCorrectionDto> {
    const existing = await this.prisma.medicalRecordCorrection.findUnique({ where: { id: correctionId } });
    if (!existing || existing.petId !== petId) throw new MedicalRecordCorrectionNotFoundException({ correctionId });

    const row = await this.prisma.medicalRecordCorrection.update({
      where: { id: correctionId },
      data: { status: dto.status as never, resolvedNote: dto.resolvedNote, resolvedAt: dto.status === "RESOLVED" ? new Date() : existing.resolvedAt },
    });
    return toMedicalRecordCorrectionDto(row);
  }
}
