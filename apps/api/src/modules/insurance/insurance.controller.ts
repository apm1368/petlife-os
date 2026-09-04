import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { InsuranceApplicationService } from "./insurance-application.service";
import { CreateInsuranceApplicationDto, UpdateInsuranceApplicationDto } from "./dto/insurance.dto";

/** Household-authenticated insurance application/lead + eligibility surface for a pet. Saved applications and eligibility checks are private — never exposed on the public browse/compare surface. */
@Controller("pets/:petId/insurance-applications")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class InsuranceController {
  constructor(private readonly applications: InsuranceApplicationService) {}

  @Get("eligibility/:productId")
  @RequirePetAccess("canViewIdentity")
  checkEligibility(@Param("petId") petId: string, @Param("productId") productId: string) {
    return this.applications.checkEligibility(petId, productId);
  }

  @Post()
  @RequirePetAccess("canEditIdentity")
  create(@Param("petId") petId: string, @CurrentUser() user: SessionUser, @Body() dto: CreateInsuranceApplicationDto) {
    return this.applications.create(petId, user.id, dto);
  }

  @Get()
  @RequirePetAccess("canViewIdentity")
  list(@Param("petId") petId: string) {
    return this.applications.list(petId);
  }

  @Get(":applicationId")
  @RequirePetAccess("canViewIdentity")
  get(@Param("petId") petId: string, @Param("applicationId") applicationId: string) {
    return this.applications.get(petId, applicationId);
  }

  @Patch(":applicationId")
  @RequirePetAccess("canEditIdentity")
  update(@Param("petId") petId: string, @Param("applicationId") applicationId: string, @Body() dto: UpdateInsuranceApplicationDto) {
    return this.applications.update(petId, applicationId, dto);
  }

  @Post(":applicationId/submit")
  @HttpCode(HttpStatus.OK)
  @RequirePetAccess("canEditIdentity")
  submit(@Param("petId") petId: string, @Param("applicationId") applicationId: string) {
    return this.applications.submit(petId, applicationId);
  }

  @Post(":applicationId/cancel")
  @HttpCode(HttpStatus.OK)
  @RequirePetAccess("canEditIdentity")
  cancel(@Param("petId") petId: string, @Param("applicationId") applicationId: string) {
    return this.applications.cancel(petId, applicationId);
  }
}
