import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { PatientVitalsService } from "./patient-vitals.service";
import { ClinicalProblemService } from "./clinical-problem.service";
import { PrescriptionService } from "./prescription.service";
import { ClinicalEstimateService } from "./clinical-estimate.service";
import { DischargeSummaryService } from "./discharge-summary.service";
import { RespondToClinicalEstimateDto } from "./dto/estimate.dto";

/**
 * The owner's half of the same rows. One record, two permission-scoped views
 * — the rule Handoff 17 locked and this handoff keeps: nothing here is a copy
 * of clinical truth, it is the same tables read through a consumer DTO.
 *
 * Three things never cross this boundary, by construction rather than by
 * filtering an already-assembled payload:
 *   - `ProviderClinicalAlert` has no consumer endpoint at all (a handling
 *     note written for staff safety is not an owner-facing statement);
 *   - `Prescription.internalNotes` is omitted by the mapper's OWNER audience
 *     rather than sent as null;
 *   - a DRAFT `DischargeSummary` is invisible until the vet issues it.
 *
 * Estimate approval lives here and only here: an owner's financial consent
 * cannot be recorded by the clinic that wrote the estimate, so there is no
 * provider route that can reach `respond()`.
 */
@Controller("pets/:petId/clinical")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class VetPanelConsumerController {
  constructor(
    private readonly vitals: PatientVitalsService,
    private readonly problems: ClinicalProblemService,
    private readonly prescriptions: PrescriptionService,
    private readonly estimates: ClinicalEstimateService,
    private readonly discharge: DischargeSummaryService,
  ) {}

  @Get("vitals")
  @RequirePetAccess("canViewHealth")
  listVitals(@Param("petId") petId: string) {
    return this.vitals.list(petId);
  }

  @Get("vitals/trends")
  @RequirePetAccess("canViewHealth")
  vitalsTrends(@Param("petId") petId: string) {
    return this.vitals.trends(petId);
  }

  @Get("problems")
  @RequirePetAccess("canViewHealth")
  listProblems(@Param("petId") petId: string) {
    return this.problems.list(petId);
  }

  @Get("prescriptions")
  @RequirePetAccess("canViewHealth")
  listPrescriptions(@Param("petId") petId: string) {
    return this.prescriptions.list(petId, "OWNER");
  }

  @Get("estimates")
  @RequirePetAccess("canViewHealth")
  listEstimates(@Param("petId") petId: string) {
    return this.estimates.listForPet(petId);
  }

  /**
   * Financial consent, so it requires `canBookCare` rather than
   * `canViewHealth` — a family member who may read the record is not
   * automatically the person who can commit the household to a bill.
   */
  @Post("estimates/:estimateId/approve")
  @RequirePetAccess("canBookCare")
  approveEstimate(@CurrentUser() user: SessionUser, @Param("petId") petId: string, @Param("estimateId") estimateId: string) {
    return this.estimates.respond(user.id, petId, estimateId, true, {});
  }

  @Post("estimates/:estimateId/decline")
  @RequirePetAccess("canBookCare")
  declineEstimate(@CurrentUser() user: SessionUser, @Param("petId") petId: string, @Param("estimateId") estimateId: string, @Body() dto: RespondToClinicalEstimateDto) {
    return this.estimates.respond(user.id, petId, estimateId, false, dto);
  }

  /** Issued summaries only — see DischargeSummaryService.listForPet. */
  @Get("discharge-summaries")
  @RequirePetAccess("canViewHealth")
  listDischargeSummaries(@Param("petId") petId: string) {
    return this.discharge.listForPet(petId);
  }
}
