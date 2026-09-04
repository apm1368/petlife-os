import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AnimalSupportOrganizationService } from "../../animal-support/animal-support-organization.service";
import { RescueCaseService } from "../../animal-support/rescue-case.service";
import { SupportCampaignService } from "../../animal-support/support-campaign.service";
import { AdminDonationService } from "../../animal-support/admin-donation.service";
import {
  CreateAnimalSupportOrganizationDto,
  CreateRescueCaseDto,
  CreateSupportCampaignDto,
  ListAnimalSupportOrganizationsQueryDto,
  ListRescueCasesQueryDto,
  ListSupportCampaignsQueryDto,
  PostSupportCampaignUpdateDto,
  RecordDonationPayoutDto,
  RefundDonationDto,
  RequestAnimalSupportMediaUploadDto,
  SetAnimalSupportListedDto,
  SetAnimalSupportVerificationStatusDto,
  UpdateAnimalSupportOrganizationDto,
  UpdateRescueCaseStatusDto,
  UpdateSupportCampaignStatusDto,
} from "../../animal-support/dto/animal-support.dto";

@Controller("admin/animal-support")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminAnimalSupportController {
  constructor(
    private readonly organizations: AnimalSupportOrganizationService,
    private readonly rescueCases: RescueCaseService,
    private readonly campaigns: SupportCampaignService,
    private readonly donations: AdminDonationService,
  ) {}

  // -- Organizations -------------------------------------------------------

  @Get("organizations")
  @RequireAdminPermission("animalSupport.view")
  listOrganizations(@Query() query: ListAnimalSupportOrganizationsQueryDto) {
    return this.organizations.adminList(query);
  }

  @Get("organizations/:organizationId")
  @RequireAdminPermission("animalSupport.view")
  getOrganization(@Param("organizationId") organizationId: string) {
    return this.organizations.adminGet(organizationId);
  }

  @Post("organizations")
  @RequireAdminPermission("animalSupport.manage")
  createOrganization(@Body() dto: CreateAnimalSupportOrganizationDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.organizations.create(admin, dto);
  }

  @Patch("organizations/:organizationId")
  @RequireAdminPermission("animalSupport.manage")
  updateOrganization(@Param("organizationId") organizationId: string, @Body() dto: UpdateAnimalSupportOrganizationDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.organizations.update(admin, organizationId, dto);
  }

  @Post("organizations/:organizationId/verification")
  @RequireAdminPermission("animalSupport.manage")
  setVerificationStatus(@Param("organizationId") organizationId: string, @Body() dto: SetAnimalSupportVerificationStatusDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.organizations.setVerificationStatus(admin, organizationId, dto);
  }

  @Post("organizations/:organizationId/listing")
  @RequireAdminPermission("animalSupport.manage")
  setListed(@Param("organizationId") organizationId: string, @Body() dto: SetAnimalSupportListedDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.organizations.setPubliclyListed(admin, organizationId, dto);
  }

  @Post("organizations/:organizationId/logo-upload-url")
  @RequireAdminPermission("animalSupport.manage")
  requestLogoUpload(@Param("organizationId") organizationId: string, @Body() dto: RequestAnimalSupportMediaUploadDto) {
    return this.organizations.requestLogoUpload(organizationId, dto.contentType, dto.fileSizeBytes);
  }

  // -- Rescue cases ----------------------------------------------------------

  @Get("rescue-cases")
  @RequireAdminPermission("animalSupport.view")
  listRescueCases(@Query() query: ListRescueCasesQueryDto) {
    return this.rescueCases.adminList(query);
  }

  @Get("rescue-cases/:rescueCaseId")
  @RequireAdminPermission("animalSupport.view")
  getRescueCase(@Param("rescueCaseId") rescueCaseId: string) {
    return this.rescueCases.adminGet(rescueCaseId);
  }

  @Post("organizations/:organizationId/rescue-cases")
  @RequireAdminPermission("animalSupport.manage")
  createRescueCase(@Param("organizationId") organizationId: string, @Body() dto: CreateRescueCaseDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.rescueCases.create(admin, organizationId, dto);
  }

  @Patch("rescue-cases/:rescueCaseId/status")
  @RequireAdminPermission("animalSupport.manage")
  setRescueCaseStatus(@Param("rescueCaseId") rescueCaseId: string, @Body() dto: UpdateRescueCaseStatusDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.rescueCases.setStatus(admin, rescueCaseId, dto);
  }

  @Post("rescue-cases/:rescueCaseId/evidence-upload-url")
  @RequireAdminPermission("animalSupport.manage")
  requestEvidenceUpload(@Param("rescueCaseId") rescueCaseId: string, @Body() dto: RequestAnimalSupportMediaUploadDto) {
    return this.rescueCases.requestEvidenceUpload(rescueCaseId, dto.contentType, dto.fileSizeBytes);
  }

  // -- Campaigns -------------------------------------------------------------

  @Get("campaigns")
  @RequireAdminPermission("animalSupport.view")
  listCampaigns(@Query() query: ListSupportCampaignsQueryDto) {
    return this.campaigns.adminList(query);
  }

  @Get("campaigns/:campaignId")
  @RequireAdminPermission("animalSupport.view")
  getCampaign(@Param("campaignId") campaignId: string) {
    return this.campaigns.adminGet(campaignId);
  }

  @Post("organizations/:organizationId/campaigns")
  @RequireAdminPermission("animalSupport.manage")
  createCampaign(@Param("organizationId") organizationId: string, @Body() dto: CreateSupportCampaignDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.campaigns.create(admin, organizationId, dto);
  }

  @Patch("campaigns/:campaignId/status")
  @RequireAdminPermission("animalSupport.manage")
  setCampaignStatus(@Param("campaignId") campaignId: string, @Body() dto: UpdateSupportCampaignStatusDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.campaigns.setStatus(admin, campaignId, dto);
  }

  @Get("campaigns/:campaignId/updates")
  @RequireAdminPermission("animalSupport.view")
  listCampaignUpdates(@Param("campaignId") campaignId: string) {
    return this.campaigns.listUpdates(campaignId);
  }

  @Post("campaigns/:campaignId/updates")
  @RequireAdminPermission("animalSupport.manage")
  postCampaignUpdate(@Param("campaignId") campaignId: string, @Body() dto: PostSupportCampaignUpdateDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.campaigns.postUpdate(admin, campaignId, dto);
  }

  @Post("campaigns/:campaignId/evidence-upload-url")
  @RequireAdminPermission("animalSupport.manage")
  requestCampaignEvidenceUpload(@Param("campaignId") campaignId: string, @Body() dto: RequestAnimalSupportMediaUploadDto) {
    return this.campaigns.requestEvidenceUpload(campaignId, dto.contentType, dto.fileSizeBytes);
  }

  @Post("campaigns/:campaignId/share-to-community")
  @RequireAdminPermission("animalSupport.manage")
  shareCampaignToCommunity(@Param("campaignId") campaignId: string, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.campaigns.shareToCommunity(admin, campaignId);
  }

  // -- Donations -----------------------------------------------------------

  @Get("organizations/:organizationId/fund-balance")
  @RequireAdminPermission("animalSupport.view")
  getFundBalance(@Param("organizationId") organizationId: string) {
    return this.donations.getFundBalance(organizationId);
  }

  @Post("organizations/:organizationId/payouts")
  @RequireAdminPermission("animalSupport.payout")
  recordPayout(@Param("organizationId") organizationId: string, @Body() dto: RecordDonationPayoutDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.donations.recordPayout(admin, organizationId, dto);
  }

  @Post("donations/:donationIntentId/refund")
  @RequireAdminPermission("animalSupport.payout")
  refundDonation(@Param("donationIntentId") donationIntentId: string, @Body() dto: RefundDonationDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.donations.refundDonation(admin, donationIntentId, dto.reason);
  }
}
