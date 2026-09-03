import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { SourceType } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { ProviderAuthGuard } from "../provider-os/auth/provider-auth.guard";
import { CurrentProviderContext } from "../provider-os/auth/current-provider-context.decorator";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { ProviderClinicalPatientService } from "./provider-clinical-patient.service";
import { ClinicalVisitService } from "./clinical-visit.service";
import { LabResultService } from "./lab-result.service";
import { ImagingStudyService } from "./imaging-study.service";
import { ReferralService } from "./referral.service";
import { DentalRecordService } from "./dental-record.service";
import { ClinicalNutritionPlanService } from "./clinical-nutrition-plan.service";
import { RehabService } from "./rehab.service";
import { CarePlanService } from "./care-plan.service";
import { MedicalDocumentService } from "./medical-document.service";
import { StartClinicalVisitDto, UpdateClinicalVisitNotesDto, AmendClinicalVisitDto, VoidClinicalVisitDto } from "./dto/clinical-visit.dto";
import { CreateLabResultDto, AmendLabResultDto } from "./dto/lab-result.dto";
import { CreateImagingStudyDto, VoidImagingStudyDto } from "./dto/imaging-study.dto";
import { CreateReferralDto, UpdateReferralStatusDto } from "./dto/referral.dto";
import { CreateDentalRecordDto } from "./dto/dental-record.dto";
import { CreateClinicalNutritionPlanDto } from "./dto/clinical-nutrition-plan.dto";
import { CreateRehabPlanDto, CreateRehabSessionDto } from "./dto/rehab.dto";
import { CreateCarePlanDto, CreateCarePlanItemDto, UpdateCarePlanItemStatusDto } from "./dto/care-plan.dto";
import { CreateMedicalDocumentDto, RequestMedicalDocumentUploadDto } from "./dto/medical-document.dto";

/**
 * Provider OS Clinical workspace. Stacks PetAccessGuard alongside
 * ProviderAuthGuard on every route — org membership alone never grants pet
 * data access (see the doc comment on ProviderUserRole/PetAccessGrant); a
 * provider must additionally hold an active canViewHealth/
 * canRecordClinicalData grant for the specific pet, which
 * BookingPetAccessService only creates for a VET-category booking. Route
 * paths mirror the codebase's own `/provider/...` convention (see
 * ProviderBookingsController) rather than the illustrative
 * `/provider-organizations/:id/...` shape from the spec's pseudocode.
 */
@Controller("provider")
@UseGuards(SessionAuthGuard, ProviderAuthGuard, PetAccessGuard)
export class ProviderClinicalController {
  constructor(
    private readonly patientView: ProviderClinicalPatientService,
    private readonly visits: ClinicalVisitService,
    private readonly labs: LabResultService,
    private readonly imaging: ImagingStudyService,
    private readonly referrals: ReferralService,
    private readonly dental: DentalRecordService,
    private readonly nutrition: ClinicalNutritionPlanService,
    private readonly rehab: RehabService,
    private readonly carePlans: CarePlanService,
    private readonly documents: MedicalDocumentService,
  ) {}

  @Get("patients/:petId")
  @RequirePetAccess("canViewHealth")
  getPatient(@Param("petId") petId: string) {
    return this.patientView.get(petId);
  }

  @Get("patients/:petId/visits")
  @RequirePetAccess("canViewHealth")
  listVisits(@Param("petId") petId: string) {
    return this.visits.list(petId);
  }

  @Get("patients/:petId/visits/:visitId")
  @RequirePetAccess("canViewHealth")
  getVisit(@Param("petId") petId: string, @Param("visitId") visitId: string) {
    return this.visits.get(petId, visitId);
  }

  @Post("visits")
  @RequirePetAccess("canRecordClinicalData")
  startVisit(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: StartClinicalVisitDto) {
    return this.visits.start(ctx, dto);
  }

  @Post("patients/:petId/visits/:visitId/notes")
  @RequirePetAccess("canRecordClinicalData")
  updateVisitNotes(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("petId") petId: string, @Param("visitId") visitId: string, @Body() dto: UpdateClinicalVisitNotesDto) {
    return this.visits.updateNotes(ctx, petId, visitId, dto);
  }

  @Post("patients/:petId/visits/:visitId/complete")
  @RequirePetAccess("canRecordClinicalData")
  completeVisit(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("petId") petId: string, @Param("visitId") visitId: string) {
    return this.visits.complete(ctx, petId, visitId);
  }

  @Post("patients/:petId/visits/:visitId/amend")
  @RequirePetAccess("canRecordClinicalData")
  amendVisit(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("petId") petId: string, @Param("visitId") visitId: string, @Body() dto: AmendClinicalVisitDto) {
    return this.visits.amend(ctx, petId, visitId, dto);
  }

  @Post("patients/:petId/visits/:visitId/void")
  @RequirePetAccess("canRecordClinicalData")
  voidVisit(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("petId") petId: string, @Param("visitId") visitId: string, @Body() dto: VoidClinicalVisitDto) {
    return this.visits.voidVisit(ctx, petId, visitId, dto);
  }

  @Post("labs")
  @RequirePetAccess("canRecordClinicalData")
  createLab(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: CreateLabResultDto) {
    return this.labs.create(ctx, dto);
  }

  @Post("labs/:labResultId/amend")
  @RequirePetAccess("canRecordClinicalData")
  amendLab(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("labResultId") labResultId: string, @Body() dto: AmendLabResultDto) {
    return this.labs.amend(ctx, dto.petId, labResultId, dto);
  }

  @Post("imaging")
  @RequirePetAccess("canRecordClinicalData")
  createImaging(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: CreateImagingStudyDto) {
    return this.imaging.create(ctx, dto);
  }

  @Post("imaging/:imagingStudyId/void")
  @RequirePetAccess("canRecordClinicalData")
  voidImaging(@Param("imagingStudyId") imagingStudyId: string, @Body() dto: VoidImagingStudyDto) {
    return this.imaging.voidStudy(dto.petId, imagingStudyId, dto.reason);
  }

  @Post("referrals")
  @RequirePetAccess("canRecordClinicalData")
  createReferral(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: CreateReferralDto) {
    return this.referrals.create(ctx, dto);
  }

  @Patch("referrals/:referralId/status")
  @RequirePetAccess("canRecordClinicalData")
  updateReferralStatus(@Param("referralId") referralId: string, @Body() dto: UpdateReferralStatusDto) {
    return this.referrals.updateStatus(dto.petId, referralId, dto.status as never);
  }

  @Post("dental-records")
  @RequirePetAccess("canRecordClinicalData")
  createDentalRecord(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: CreateDentalRecordDto) {
    return this.dental.create(ctx, dto);
  }

  @Post("nutrition-plans")
  @RequirePetAccess("canRecordClinicalData")
  createNutritionPlan(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: CreateClinicalNutritionPlanDto) {
    return this.nutrition.create(ctx, dto);
  }

  @Post("rehab-plans")
  @RequirePetAccess("canRecordClinicalData")
  createRehabPlan(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: CreateRehabPlanDto) {
    return this.rehab.createPlan(ctx, dto);
  }

  @Post("patients/:petId/rehab-plans/:rehabPlanId/sessions")
  @RequirePetAccess("canRecordClinicalData")
  addRehabSession(@Param("petId") petId: string, @Param("rehabPlanId") rehabPlanId: string, @Body() dto: CreateRehabSessionDto) {
    return this.rehab.addSession(petId, rehabPlanId, dto);
  }

  @Post("care-plans")
  @RequirePetAccess("canRecordClinicalData")
  createCarePlan(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: CreateCarePlanDto) {
    return this.carePlans.create(ctx, dto);
  }

  @Post("patients/:petId/care-plans/:carePlanId/items")
  @RequirePetAccess("canRecordClinicalData")
  addCarePlanItem(@Param("petId") petId: string, @Param("carePlanId") carePlanId: string, @Body() dto: CreateCarePlanItemDto) {
    return this.carePlans.addItem(petId, carePlanId, dto);
  }

  @Patch("patients/:petId/care-plans/:carePlanId/items/:itemId/status")
  @RequirePetAccess("canRecordClinicalData")
  updateCarePlanItemStatus(@Param("petId") petId: string, @Param("carePlanId") carePlanId: string, @Param("itemId") itemId: string, @Body() dto: UpdateCarePlanItemStatusDto) {
    return this.carePlans.updateItemStatus(petId, carePlanId, itemId, dto);
  }

  @Post("patients/:petId/documents/upload-url")
  @RequirePetAccess("canRecordClinicalData")
  requestDocumentUpload(@Param("petId") petId: string, @Body() dto: RequestMedicalDocumentUploadDto) {
    return this.documents.requestUpload(petId, dto);
  }

  @Post("patients/:petId/documents")
  @RequirePetAccess("canRecordClinicalData")
  createDocument(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("petId") petId: string, @Body() dto: CreateMedicalDocumentDto) {
    return this.documents.create(petId, { sourceType: SourceType.PROVIDER, provider: ctx }, dto);
  }
}
