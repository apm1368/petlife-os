import { Injectable } from "@nestjs/common";
import { AnimalSupportVerificationStatus, Prisma, SupportCampaignStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AnimalSupportOrganizationNotFoundException, RescueCaseNotFoundException, SupportCampaignNotFoundException } from "../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto } from "../../common/pagination/pagination.dto";
import { DonationLedgerService } from "./donation-ledger.service";
import { toAnimalSupportOrganizationDto, toRescueCaseDto, toSupportCampaignDto, toSupportCampaignUpdateDto } from "./animal-support-mapper";
import type { ListAnimalSupportOrganizationsQueryDto, ListRescueCasesQueryDto, ListSupportCampaignsQueryDto } from "./dto/animal-support.dto";

const CASE_INCLUDE = { organization: { select: { name: true } } } satisfies Prisma.RescueCaseInclude;
const CAMPAIGN_INCLUDE = { organization: { select: { name: true } } } satisfies Prisma.SupportCampaignInclude;

/**
 * Public, anonymous-readable Animal Support directory (spec: "rescue
 * organizations... may be public where appropriate") — a dedicated
 * read-only service with no AdminAuditLogService dependency, mirroring
 * PublicContentReadService's own "the public half and the admin-mutating
 * half never import each other" layering (Handoff 15). Only VERIFIED +
 * isPubliclyListed organizations, and rescue cases that belong to one, are
 * ever reachable here.
 */
@Injectable()
export class PublicAnimalSupportReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly donationLedger: DonationLedgerService,
  ) {}

  async listOrganizations(query: ListAnimalSupportOrganizationsQueryDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.AnimalSupportOrganizationWhereInput = { verificationStatus: AnimalSupportVerificationStatus.VERIFIED, isPubliclyListed: true };
    const [rows, total] = await Promise.all([
      this.prisma.animalSupportOrganization.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.animalSupportOrganization.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toAnimalSupportOrganizationDto), total, page, pageSize);
  }

  async getOrganization(id: string) {
    const row = await this.prisma.animalSupportOrganization.findFirst({
      where: { id, verificationStatus: AnimalSupportVerificationStatus.VERIFIED, isPubliclyListed: true },
    });
    if (!row) throw new AnimalSupportOrganizationNotFoundException({ organizationId: id });
    return toAnimalSupportOrganizationDto(row);
  }

  async listRescueCases(query: ListRescueCasesQueryDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.RescueCaseWhereInput = {
      organizationId: query.organizationId,
      status: query.status,
      organization: { verificationStatus: AnimalSupportVerificationStatus.VERIFIED, isPubliclyListed: true },
    };
    const [rows, total] = await Promise.all([
      this.prisma.rescueCase.findMany({ where, include: CASE_INCLUDE, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.rescueCase.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toRescueCaseDto), total, page, pageSize);
  }

  async getRescueCase(id: string) {
    const row = await this.prisma.rescueCase.findFirst({
      where: { id, organization: { verificationStatus: AnimalSupportVerificationStatus.VERIFIED, isPubliclyListed: true } },
      include: CASE_INCLUDE,
    });
    if (!row) throw new RescueCaseNotFoundException({ rescueCaseId: id });
    return toRescueCaseDto(row);
  }

  /** spec: "rescue campaigns... public where safe" — only ACTIVE campaigns belonging to a VERIFIED + listed organization; DRAFT/PAUSED/COMPLETED/CANCELLED never appear publicly. */
  async listCampaigns(query: ListSupportCampaignsQueryDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.SupportCampaignWhereInput = {
      organizationId: query.organizationId,
      rescueCaseId: query.rescueCaseId,
      status: SupportCampaignStatus.ACTIVE,
      organization: { verificationStatus: AnimalSupportVerificationStatus.VERIFIED, isPubliclyListed: true },
    };
    const [rows, total] = await Promise.all([
      this.prisma.supportCampaign.findMany({ where, include: CAMPAIGN_INCLUDE, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.supportCampaign.count({ where }),
    ]);
    const items = await Promise.all(rows.map(async (row) => toSupportCampaignDto(row, await this.donationLedger.getCampaignRaisedIrr(row.id))));
    return toPaginatedDto(items, total, page, pageSize);
  }

  async getCampaign(id: string) {
    const row = await this.prisma.supportCampaign.findFirst({
      where: { id, status: SupportCampaignStatus.ACTIVE, organization: { verificationStatus: AnimalSupportVerificationStatus.VERIFIED, isPubliclyListed: true } },
      include: CAMPAIGN_INCLUDE,
    });
    if (!row) throw new SupportCampaignNotFoundException({ campaignId: id });
    return toSupportCampaignDto(row, await this.donationLedger.getCampaignRaisedIrr(row.id));
  }

  async listCampaignUpdates(campaignId: string) {
    await this.getCampaign(campaignId);
    const rows = await this.prisma.supportCampaignUpdate.findMany({ where: { campaignId }, orderBy: { createdAt: "desc" } });
    return rows.map(toSupportCampaignUpdateDto);
  }
}
