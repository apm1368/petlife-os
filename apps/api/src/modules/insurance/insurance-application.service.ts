import { Injectable } from "@nestjs/common";
import { InsuranceApplicationStatus, InsuranceVerificationStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { EligibilityService } from "./eligibility.service";
import { InsuranceApplicationNotFoundException, InsuranceProductNotFoundException, InvalidInsuranceApplicationTransitionException } from "../../common/errors/api-exception";
import { toInsuranceApplicationDto } from "./insurance-mapper";
import type { CreateInsuranceApplicationDto, UpdateInsuranceApplicationDto } from "./dto/insurance.dto";

const APPLICATION_INCLUDE = { product: { include: { provider: true } }, pet: true } satisfies Prisma.InsuranceApplicationInclude;

/**
 * A lightweight application/lead, not an underwriting flow (spec: "if there
 * is no real insurer integration, do not simulate underwriting approval").
 * No method here ever sets status to APPROVED or DECLINED — those values
 * exist in the enum only for a future real insurer integration to set.
 */
const ALLOWED_APPLICATION_TRANSITIONS: Record<InsuranceApplicationStatus, InsuranceApplicationStatus[]> = {
  [InsuranceApplicationStatus.DRAFT]: [InsuranceApplicationStatus.SUBMITTED, InsuranceApplicationStatus.CANCELLED],
  [InsuranceApplicationStatus.SUBMITTED]: [InsuranceApplicationStatus.UNDER_REVIEW, InsuranceApplicationStatus.CANCELLED],
  [InsuranceApplicationStatus.UNDER_REVIEW]: [InsuranceApplicationStatus.CANCELLED],
  [InsuranceApplicationStatus.APPROVED]: [],
  [InsuranceApplicationStatus.DECLINED]: [],
  [InsuranceApplicationStatus.CANCELLED]: [],
};

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

  /** A standalone eligibility read — no application is created; lets the Eligibility Summary screen show a household what to expect before they apply. */
  async checkEligibility(petId: string, productId: string) {
    const pet = await this.prisma.pet.findUniqueOrThrow({ where: { id: petId } });
    const product = await this.prisma.insuranceProduct.findFirst({ where: { id: productId, status: InsuranceVerificationStatus.VERIFIED, isPubliclyListed: true } });
    if (!product) throw new InsuranceProductNotFoundException({ productId });
    return this.eligibility.evaluate(pet, product);
  }

  async create(petId: string, applicantUserId: string, dto: CreateInsuranceApplicationDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const pet = await tx.pet.findUniqueOrThrow({ where: { id: petId } });
      const product = await tx.insuranceProduct.findFirst({
        where: { id: dto.productId, status: InsuranceVerificationStatus.VERIFIED, isPubliclyListed: true },
      });
      if (!product) throw new InsuranceProductNotFoundException({ productId: dto.productId });

      const result = this.eligibility.evaluate(pet, product);

      const created = await tx.insuranceApplication.create({
        data: {
          productId: product.id,
          householdId: pet.householdId,
          petId,
          applicantUserId,
          eligibilityStatus: result.status,
          notes: dto.notes,
        },
        include: APPLICATION_INCLUDE,
      });
      return created;
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
    if (existing.status !== InsuranceApplicationStatus.DRAFT) {
      throw new InvalidInsuranceApplicationTransitionException({ applicationId, from: existing.status, to: existing.status });
    }
    const row = await this.prisma.insuranceApplication.update({ where: { id: applicationId }, data: { notes: dto.notes }, include: APPLICATION_INCLUDE });
    return toInsuranceApplicationDto(row);
  }

  /** DRAFT -> SUBMITTED — the only place submittedAt is ever set. Never transitions further on its own; UNDER_REVIEW/APPROVED/DECLINED require a real insurer integration this handoff does not have. */
  async submit(petId: string, applicationId: string) {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.insuranceApplication.findFirst({ where: { id: applicationId, petId } });
      if (!existing) throw new InsuranceApplicationNotFoundException({ petId, applicationId });
      if (!ALLOWED_APPLICATION_TRANSITIONS[existing.status].includes(InsuranceApplicationStatus.SUBMITTED)) {
        throw new InvalidInsuranceApplicationTransitionException({ applicationId, from: existing.status, to: InsuranceApplicationStatus.SUBMITTED });
      }
      const updated = await tx.insuranceApplication.update({
        where: { id: applicationId },
        data: { status: InsuranceApplicationStatus.SUBMITTED, submittedAt: new Date() },
        include: APPLICATION_INCLUDE,
      });
      await this.events.publish(
        "InsuranceApplicationSubmitted",
        { petId, householdId: updated.householdId, applicationId: updated.id, productId: updated.productId },
        { tx, aggregateType: "Pet", aggregateId: petId },
      );
      return updated;
    });
    return toInsuranceApplicationDto(row);
  }

  async cancel(petId: string, applicationId: string) {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.insuranceApplication.findFirst({ where: { id: applicationId, petId } });
      if (!existing) throw new InsuranceApplicationNotFoundException({ petId, applicationId });
      if (!ALLOWED_APPLICATION_TRANSITIONS[existing.status].includes(InsuranceApplicationStatus.CANCELLED)) {
        throw new InvalidInsuranceApplicationTransitionException({ applicationId, from: existing.status, to: InsuranceApplicationStatus.CANCELLED });
      }
      const updated = await tx.insuranceApplication.update({
        where: { id: applicationId },
        data: { status: InsuranceApplicationStatus.CANCELLED, decidedAt: new Date() },
        include: APPLICATION_INCLUDE,
      });
      await this.events.publish(
        "InsuranceApplicationStatusChanged",
        { petId, applicationId: updated.id, from: existing.status, to: updated.status },
        { tx, aggregateType: "Pet", aggregateId: petId },
      );
      return updated;
    });
    return toInsuranceApplicationDto(row);
  }
}
