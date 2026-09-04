import { Controller, Get, Param, Query } from "@nestjs/common";
import { PublicAnimalSupportReadService } from "./public-animal-support-read.service";
import { DonationService } from "./donation.service";
import { ListAnimalSupportOrganizationsQueryDto, ListPublicDonationsQueryDto, ListRescueCasesQueryDto, ListSupportCampaignsQueryDto } from "./dto/animal-support.dto";

/**
 * Public directory (spec: "rescue organizations... campaigns... public
 * where safe") — no guard at all, mirroring
 * PublicLostPetController/PublicBlogController's own "no guard by design"
 * precedent. The donor list here is read-only and already filtered to
 * consenting donors (DonationService.listPublicDonors) — donation payment
 * execution itself requires authentication and lives on DonationController.
 */
@Controller("animal-support")
export class PublicAnimalSupportController {
  constructor(
    private readonly reads: PublicAnimalSupportReadService,
    private readonly donations: DonationService,
  ) {}

  @Get("organizations")
  listOrganizations(@Query() query: ListAnimalSupportOrganizationsQueryDto) {
    return this.reads.listOrganizations(query);
  }

  @Get("organizations/:organizationId")
  getOrganization(@Param("organizationId") organizationId: string) {
    return this.reads.getOrganization(organizationId);
  }

  @Get("rescue-cases")
  listRescueCases(@Query() query: ListRescueCasesQueryDto) {
    return this.reads.listRescueCases(query);
  }

  @Get("rescue-cases/:rescueCaseId")
  getRescueCase(@Param("rescueCaseId") rescueCaseId: string) {
    return this.reads.getRescueCase(rescueCaseId);
  }

  @Get("campaigns")
  listCampaigns(@Query() query: ListSupportCampaignsQueryDto) {
    return this.reads.listCampaigns(query);
  }

  @Get("campaigns/:campaignId")
  getCampaign(@Param("campaignId") campaignId: string) {
    return this.reads.getCampaign(campaignId);
  }

  @Get("campaigns/:campaignId/updates")
  listCampaignUpdates(@Param("campaignId") campaignId: string) {
    return this.reads.listCampaignUpdates(campaignId);
  }

  @Get("campaigns/:campaignId/donors")
  listCampaignDonors(@Param("campaignId") campaignId: string, @Query() query: ListPublicDonationsQueryDto) {
    return this.donations.listPublicDonors(campaignId, query.limit ?? 50);
  }
}
