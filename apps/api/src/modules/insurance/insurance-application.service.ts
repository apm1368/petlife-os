import { Injectable } from "@nestjs/common";
import { InsuranceApplicationStatus, InsuranceVerificationStatus, Prisma } from "@prisma/client";
import type { InsurerApplicationDetailDto, InsurerApplicationRowDto, PaginatedDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { EligibilityService } from "./eligibility.service";
import {
  InsuranceApplicationNotFoundException,
  InsuranceProductNotFoundException,
  InvalidInsuranceApplicationTransitionException,
  ValidationApiException,
} from "../../common/errors/api-exception";
import { toInsuranceApplicationDto } from "./insurance-mapper";
import type { CreateInsuranceApplicationDto, UpdateInsuranceApplicationDto } from "./dto/insurance.dto";

const APPLICATION_INCLUDE = { product: { include: { provider: true } }, pet: true, events: { orderBy: { createdAt: "asc" } } } satisfies Prisma.InsuranceApplicationInclude;

/** What the applicant agrees to when submitting — shown verbatim in the UI and stored with the application. */
export const INSURANCE_CONSENT_TEXT =
  "I agree that PET LIFE shares this application, my contact details and my pet's species, breed, age and weight with the insurer so it can review the application. This is not an insurance policy; cover starts only if the insurer issues one.";

/**
 * A lead/application workflow, not underwriting. PET LIFE never decides an
 * application: APPROVED/DECLINED are set only by the insurer's own team
 * through the insurer portal, and "approved" means the insurer accepted the
 * application — the policy itself is issued by the insurer.
 */
const APPLICANT_TRANSITIONS: Record<InsuranceApplicationStatus, InsuranceApplicationStatus[]> = {
  [InsuranceApplicationStatus.DRAFT]: [InsuranceApplicationStatus.SUBMITTED, InsuranceApplicationStatus.CANCELLED],
  [InsuranceApplicationStatus.SUBMITTED]: [InsuranceApplicationStatus.CANCELLED],
  [InsuranceApplicationStatus.UNDER_REVIEW]: [InsuranceApplicationStatus.CANCELLED],
  [InsuranceApplicationStatus.NEEDS_INFORMATION]: [InsuranceApplicationStatus.SUBMITTED, InsuranceApplicationStatus.CANCELLED],
  [InsuranceApplicationStatus.APPROVED]: [],
  [InsuranceApplicationStatus.DECLINED]: [],
  [InsuranceApplicationStatus.CANCELLED]: [],
};

export const INSURER_TRANSITIONS: Record<InsuranceApplicationStatus, InsuranceApplicationStatus[]> = {
  [InsuranceApplicationStatus.DRAFT]: [],
  [InsuranceApplicationStatus.SUBMITTED]: [InsuranceApplicationStatus.UNDER_REVIEW, InsuranceApplicationStatus.NEEDS_INFORMATION, InsuranceApplicationStatus.DECLINED],
  [InsuranceApplicationStatus.UNDER_REVIEW]: [InsuranceApplicationStatus.NEEDS_INFORMATION, InsuranceApplicationStatus.APPROVED, InsuranceApplicationStatus.DECLINED],
  [InsuranceApplicationStatus.NEEDS_INFORMATION]: [InsuranceApplicationStatus.DECLINED],
  [InsuranceApplicationStatus.APPROVED]: [],
  [InsuranceApplicationStatus.DECLINED]: [],
  [InsuranceApplicationStatus.CANCELLED]: [],
};

const EDITABLE: InsuranceApplicationStatus[] = [InsuranceApplicationStatus.DRAFT, InsuranceApplicationStatus.NEEDS_INFORMATION];

function ageMonths(pet: { birthDate: Date | null; approximateAgeMonths: number | null }): number | null {
  if (pet.birthDate) return Math.floor((Date.now() - pet.birthDate.getTime()) / (30.44 * 86_400_000));
  return pet.approximateAgeMonths ?? null;
}

@Injectable()
export class InsuranceApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly eligibility: EligibilityService,
  ) {}

  private async getRaw(petId: string, applicationId: string) {
    const row = await this.prisma.insuranceApplication.findFirst({ where: { id: applicationId, petId }, include: APPLICATION_INCLUDE });
    if (!row) throw new InsuranceApplicationNotFoundException({ petId, applicationId });
    return row;
  }

  async checkEligibility(petId: string, productId: string) {
    const pet = await this.prisma.pet.findUniqueOrThrow({ where: { id: petId } });
    const product = await this.prisma.insuranceProduct.findFirst({ where: { id: productId, status: InsuranceVerificationStatus.VERIFIED, isPubliclyListed: true } });
    if (!product) throw new InsuranceProductNotFoundException({ productId });
    return this.eligibility.evaluate(pet, product);
  }

  async create(petId: string, applicantUserId: string, dto: CreateInsuranceApplicationDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const pet = await tx.pet.findUniqueOrThrow({ where: { id: petId } });
      const product = await tx.insuranceProduct.findFirst({ where: { id: dto.productId, status: InsuranceVerificationStatus.VERIFIED, isPubliclyListed: true } });
      if (!product) throw new InsuranceProductNotFoundException({ productId: dto.productId });
      const result = this.eligibility.evaluate(pet, product);
      return tx.insuranceApplication.create({
        data: {
          productId: product.id,
          householdId: pet.householdId,
          petId,
          applicantUserId,
          eligibilityStatus: result.status,
          notes: dto.notes,
          events: { create: { fromStatus: null, toStatus: InsuranceApplicationStatus.DRAFT, actorType: "APPLICANT", actorId: applicantUserId } },
        },
        include: APPLICATION_INCLUDE,
      });
    });
    return toInsuranceApplicationDto(row);
  }

  async list(petId: string) {
    const rows = await this.prisma.insuranceApplication.findMany({ where: { petId }, include: APPLICATION_INCLUDE, orderBy: { createdAt: "desc" } });
    return rows.map(toInsuranceApplicationDto);
  }

  async get(petId: string, applicationId: string) {
    return toInsuranceApplicationDto(await this.getRaw(petId, applicationId));
  }

  async update(petId: string, applicationId: string, dto: UpdateInsuranceApplicationDto) {
    const existing = await this.getRaw(petId, applicationId);
    if (!EDITABLE.includes(existing.status)) {
      throw new InvalidInsuranceApplicationTransitionException({ applicationId, from: existing.status, to: existing.status });
    }
    const row = await this.prisma.insuranceApplication.update({ where: { id: applicationId }, data: { notes: dto.notes }, include: APPLICATION_INCLUDE });
    return toInsuranceApplicationDto(row);
  }

  /** DRAFT/NEEDS_INFORMATION → SUBMITTED. Requires the applicant's explicit consent to share the listed data with the insurer. */
  async submit(petId: string, applicationId: string, userId: string, consent: boolean | undefined) {
    if (consent !== true) throw new ValidationApiException({ field: "consent", reason: "CONSENT_REQUIRED" });
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.insuranceApplication.findFirst({ where: { id: applicationId, petId } });
      if (!existing) throw new InsuranceApplicationNotFoundException({ petId, applicationId });
      if (!APPLICANT_TRANSITIONS[existing.status].includes(InsuranceApplicationStatus.SUBMITTED)) {
        throw new InvalidInsuranceApplicationTransitionException({ applicationId, from: existing.status, to: InsuranceApplicationStatus.SUBMITTED });
      }
      const moved = await tx.insuranceApplication.updateMany({
        where: { id: applicationId, status: existing.status },
        data: { status: InsuranceApplicationStatus.SUBMITTED, submittedAt: new Date(), consentAt: new Date(), consentText: INSURANCE_CONSENT_TEXT },
      });
      if (moved.count === 0) throw new InvalidInsuranceApplicationTransitionException({ applicationId, reason: "CHANGED_CONCURRENTLY" });
      await tx.insuranceApplicationEvent.create({ data: { applicationId, fromStatus: existing.status, toStatus: InsuranceApplicationStatus.SUBMITTED, actorType: "APPLICANT", actorId: userId } });
      const updated = await tx.insuranceApplication.findUniqueOrThrow({ where: { id: applicationId }, include: APPLICATION_INCLUDE });
      await this.events.publish(
        "InsuranceApplicationSubmitted",
        { petId, householdId: updated.householdId, applicationId: updated.id, productId: updated.productId, providerId: updated.product.providerId },
        { tx, aggregateType: "Pet", aggregateId: petId },
      );
      return updated;
    });
    return toInsuranceApplicationDto(row);
  }

  async cancel(petId: string, applicationId: string, userId?: string) {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.insuranceApplication.findFirst({ where: { id: applicationId, petId } });
      if (!existing) throw new InsuranceApplicationNotFoundException({ petId, applicationId });
      if (!APPLICANT_TRANSITIONS[existing.status].includes(InsuranceApplicationStatus.CANCELLED)) {
        throw new InvalidInsuranceApplicationTransitionException({ applicationId, from: existing.status, to: InsuranceApplicationStatus.CANCELLED });
      }
      await tx.insuranceApplication.update({ where: { id: applicationId }, data: { status: InsuranceApplicationStatus.CANCELLED, decidedAt: new Date() } });
      await tx.insuranceApplicationEvent.create({ data: { applicationId, fromStatus: existing.status, toStatus: InsuranceApplicationStatus.CANCELLED, actorType: "APPLICANT", actorId: userId ?? null } });
      await this.events.publish("InsuranceApplicationStatusChanged", { petId, applicationId, from: existing.status, to: InsuranceApplicationStatus.CANCELLED }, { tx, aggregateType: "Pet", aggregateId: petId });
      return tx.insuranceApplication.findUniqueOrThrow({ where: { id: applicationId }, include: APPLICATION_INCLUDE });
    });
    return toInsuranceApplicationDto(row);
  }

  // --- Insurer portal ----------------------------------------------------------------

  private toInsurerRow(r: Prisma.InsuranceApplicationGetPayload<{ include: typeof APPLICATION_INCLUDE }>): InsurerApplicationRowDto {
    return {
      id: r.id,
      productName: r.product.name,
      status: r.status as unknown as InsurerApplicationRowDto["status"],
      eligibilityStatus: r.eligibilityStatus as unknown as InsurerApplicationRowDto["eligibilityStatus"],
      petSpecies: r.pet.species,
      petAgeMonths: ageMonths(r.pet),
      petBreed: r.pet.breed ?? null,
      submittedAt: r.submittedAt?.toISOString() ?? null,
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  /** Only submitted (consented) applications for this insurer's own products; drafts are never visible to insurers. */
  async listForInsurer(providerId: string, query: { status?: InsuranceApplicationStatus; page?: number }): Promise<PaginatedDto<InsurerApplicationRowDto>> {
    const page = query.page ?? 1;
    const size = 25;
    const where: Prisma.InsuranceApplicationWhereInput = {
      product: { providerId },
      consentAt: { not: null },
      ...(query.status ? { status: query.status } : { status: { not: InsuranceApplicationStatus.DRAFT } }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.insuranceApplication.findMany({ where, include: APPLICATION_INCLUDE, orderBy: [{ submittedAt: "asc" }, { id: "asc" }], skip: (page - 1) * size, take: size }),
      this.prisma.insuranceApplication.count({ where }),
    ]);
    return { items: rows.map((r) => this.toInsurerRow(r)), total, page, pageSize: size };
  }

  private async loadForInsurer(providerId: string, applicationId: string) {
    const row = await this.prisma.insuranceApplication.findFirst({ where: { id: applicationId, product: { providerId }, consentAt: { not: null } }, include: APPLICATION_INCLUDE });
    if (!row) throw new InsuranceApplicationNotFoundException({ applicationId });
    return row;
  }

  async getForInsurer(providerId: string, applicationId: string): Promise<InsurerApplicationDetailDto> {
    const r = await this.loadForInsurer(providerId, applicationId);
    return {
      ...this.toInsurerRow(r),
      notes: r.notes,
      insurerMessage: r.insurerMessage,
      externalReference: r.externalReference,
      consentAt: r.consentAt?.toISOString() ?? null,
      timeline: r.events.map((e) => ({ fromStatus: e.fromStatus, toStatus: e.toStatus, actorType: e.actorType, note: e.note, createdAt: e.createdAt.toISOString() })),
    };
  }

  async transitionAsInsurer(providerId: string, userId: string, applicationId: string, to: InsuranceApplicationStatus, message?: string, externalReference?: string): Promise<InsurerApplicationDetailDto> {
    const existing = await this.loadForInsurer(providerId, applicationId);
    if (!INSURER_TRANSITIONS[existing.status].includes(to)) throw new InvalidInsuranceApplicationTransitionException({ applicationId, from: existing.status, to });
    if ((to === InsuranceApplicationStatus.NEEDS_INFORMATION || to === InsuranceApplicationStatus.DECLINED) && !message?.trim()) {
      throw new ValidationApiException({ field: "message", reason: "REQUIRED_FOR_APPLICANT" });
    }
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.insuranceApplication.updateMany({
        where: { id: applicationId, status: existing.status },
        data: {
          status: to,
          insurerMessage: message?.trim() || null,
          ...(externalReference ? { externalReference: externalReference.trim() } : {}),
          ...(to === InsuranceApplicationStatus.APPROVED || to === InsuranceApplicationStatus.DECLINED ? { decidedAt: new Date() } : {}),
        },
      });
      if (moved.count === 0) throw new InvalidInsuranceApplicationTransitionException({ applicationId, reason: "CHANGED_CONCURRENTLY" });
      await tx.insuranceApplicationEvent.create({ data: { applicationId, fromStatus: existing.status, toStatus: to, actorType: "INSURER", actorId: userId, note: message?.trim() || null } });
      await this.events.publish(
        to === InsuranceApplicationStatus.NEEDS_INFORMATION ? "InsuranceApplicationNeedsInformation" : "InsuranceApplicationStatusChanged",
        { petId: existing.petId, applicationId, from: existing.status, to },
        { tx, aggregateType: "Pet", aggregateId: existing.petId },
      );
    });
    return this.getForInsurer(providerId, applicationId);
  }
}
