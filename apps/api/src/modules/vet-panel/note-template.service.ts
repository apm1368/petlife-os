import { Injectable } from "@nestjs/common";
import type { ClinicalNoteTemplateDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ClinicalNoteTemplateNotFoundException } from "../../common/errors/api-exception";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { toClinicalNoteTemplateDto } from "./vet-panel.mapper";
import type { CreateNoteTemplateDto, UpdateNoteTemplateDto } from "./dto/note-template.dto";

/**
 * Org-scoped SOAP scaffolds. A template is not clinical content: applying one
 * only pre-fills the visit's editable fields in the browser, and nothing
 * reaches the record until the vet saves notes they actually wrote. That is
 * why templates carry no pet reference, no provenance, and no `PetAccessGuard`
 * — they are the organisation's own stationery.
 *
 * Retiring a template sets `isActive: false` rather than deleting it, so a
 * visit written from it years ago can still be explained.
 */
@Injectable()
export class ClinicalNoteTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: ResolvedProviderContext, includeInactive = false): Promise<ClinicalNoteTemplateDto[]> {
    const rows = await this.prisma.clinicalNoteTemplate.findMany({
      where: { providerOrganizationId: ctx.organizationId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
    return rows.map(toClinicalNoteTemplateDto);
  }

  async create(ctx: ResolvedProviderContext, dto: CreateNoteTemplateDto): Promise<ClinicalNoteTemplateDto> {
    const row = await this.prisma.clinicalNoteTemplate.create({
      data: {
        providerOrganizationId: ctx.organizationId,
        createdByProviderUserId: ctx.providerUserId,
        name: dto.name,
        presentingComplaint: dto.presentingComplaint ?? null,
        species: dto.species ?? null,
        reasonForVisitTemplate: dto.reasonForVisitTemplate ?? null,
        historyTemplate: dto.historyTemplate ?? null,
        observationsTemplate: dto.observationsTemplate ?? null,
        assessmentTemplate: dto.assessmentTemplate ?? null,
        planTemplate: dto.planTemplate ?? null,
      },
    });
    return toClinicalNoteTemplateDto(row);
  }

  async update(ctx: ResolvedProviderContext, templateId: string, dto: UpdateNoteTemplateDto): Promise<ClinicalNoteTemplateDto> {
    const existing = await this.prisma.clinicalNoteTemplate.findUnique({ where: { id: templateId } });
    if (!existing || existing.providerOrganizationId !== ctx.organizationId) throw new ClinicalNoteTemplateNotFoundException({ templateId });

    const row = await this.prisma.clinicalNoteTemplate.update({
      where: { id: templateId },
      data: {
        name: dto.name ?? existing.name,
        presentingComplaint: dto.presentingComplaint ?? existing.presentingComplaint,
        species: dto.species ?? existing.species,
        reasonForVisitTemplate: dto.reasonForVisitTemplate ?? existing.reasonForVisitTemplate,
        historyTemplate: dto.historyTemplate ?? existing.historyTemplate,
        observationsTemplate: dto.observationsTemplate ?? existing.observationsTemplate,
        assessmentTemplate: dto.assessmentTemplate ?? existing.assessmentTemplate,
        planTemplate: dto.planTemplate ?? existing.planTemplate,
        isActive: dto.isActive ?? existing.isActive,
      },
    });
    return toClinicalNoteTemplateDto(row);
  }
}
