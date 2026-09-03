import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from "@nestjs/common";
import { SourceType } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { MedicalDocumentService } from "./medical-document.service";
import { MedicalRecordCorrectionService } from "./medical-record-correction.service";
import { LabResultService } from "./lab-result.service";
import { ImagingStudyService } from "./imaging-study.service";
import { ReferralService } from "./referral.service";
import { DentalRecordService } from "./dental-record.service";
import { ClinicalNutritionPlanService } from "./clinical-nutrition-plan.service";
import { RehabService } from "./rehab.service";
import { ClinicalVisitService } from "./clinical-visit.service";
import { CarePlanService } from "./care-plan.service";
import { SeniorCareService } from "./senior-care.service";
import { EndOfLifeCareService } from "./end-of-life-care.service";
import { HealthTimelineService } from "./health-timeline.service";
import { HealthOverviewService } from "./health-overview.service";
import { CreateMedicalDocumentDto, RequestMedicalDocumentUploadDto, VoidMedicalDocumentDto } from "./dto/medical-document.dto";
import { CreateMedicalRecordCorrectionDto } from "./dto/correction.dto";
import { CreateSeniorCareNoteDto } from "./dto/senior-care.dto";
import { UpsertEndOfLifeCarePlanDto } from "./dto/end-of-life.dto";

/**
 * Consumer-facing advanced health surface. Every read requires
 * canViewHealth; every owner-side write requires canEditHealth — see the
 * doc comment on PetAccessGrant.canRecordClinicalData for why providers
 * never reach this controller for writes (they use ProviderClinicalController
 * instead, which nests under a visit).
 */
@Controller("pets/:petId/health")
@UseGuards(SessionAuthGuard, PetAccessGuard)
export class HealthAdvancedController {
  constructor(
    private readonly documents: MedicalDocumentService,
    private readonly corrections: MedicalRecordCorrectionService,
    private readonly labs: LabResultService,
    private readonly imaging: ImagingStudyService,
    private readonly referrals: ReferralService,
    private readonly dental: DentalRecordService,
    private readonly nutrition: ClinicalNutritionPlanService,
    private readonly rehab: RehabService,
    private readonly visits: ClinicalVisitService,
    private readonly carePlans: CarePlanService,
    private readonly seniorCare: SeniorCareService,
    private readonly endOfLife: EndOfLifeCareService,
    private readonly timeline: HealthTimelineService,
    private readonly overview: HealthOverviewService,
  ) {}

  @Get()
  @RequirePetAccess("canViewHealth")
  getOverview(@Param("petId") petId: string) {
    return this.overview.get(petId);
  }

  @Get("timeline")
  @RequirePetAccess("canViewHealth")
  getTimeline(@Param("petId") petId: string) {
    return this.timeline.list(petId);
  }

  @Get("documents")
  @RequirePetAccess("canViewHealth")
  listDocuments(@Param("petId") petId: string) {
    return this.documents.list(petId);
  }

  @Post("documents/upload-url")
  @RequirePetAccess("canEditHealth")
  requestDocumentUpload(@Param("petId") petId: string, @Body() dto: RequestMedicalDocumentUploadDto) {
    return this.documents.requestUpload(petId, dto);
  }

  @Post("documents")
  @RequirePetAccess("canEditHealth")
  createDocument(@Param("petId") petId: string, @CurrentUser() user: SessionUser, @Body() dto: CreateMedicalDocumentDto) {
    return this.documents.create(petId, { sourceType: SourceType.OWNER, sourceUserId: user.id }, dto);
  }

  @Get("documents/:documentId")
  @RequirePetAccess("canViewHealth")
  getDocument(@Param("petId") petId: string, @Param("documentId") documentId: string) {
    return this.documents.getDto(petId, documentId);
  }

  @Get("documents/:documentId/download")
  @RequirePetAccess("canViewHealth")
  downloadDocument(@Param("petId") petId: string, @Param("documentId") documentId: string) {
    return this.documents.getDownload(petId, documentId);
  }

  @Post("documents/:documentId/void")
  @RequirePetAccess("canEditHealth")
  voidDocument(@Param("petId") petId: string, @Param("documentId") documentId: string, @Body() dto: VoidMedicalDocumentDto) {
    return this.documents.voidDocument(petId, documentId, dto.reason);
  }

  @Post("corrections")
  @RequirePetAccess("canEditHealth")
  createCorrection(@Param("petId") petId: string, @CurrentUser() user: SessionUser, @Body() dto: CreateMedicalRecordCorrectionDto) {
    return this.corrections.create(petId, user.id, dto);
  }

  @Get("corrections")
  @RequirePetAccess("canViewHealth")
  listCorrections(@Param("petId") petId: string) {
    return this.corrections.list(petId);
  }

  @Get("labs")
  @RequirePetAccess("canViewHealth")
  listLabs(@Param("petId") petId: string) {
    return this.labs.list(petId);
  }

  @Get("imaging")
  @RequirePetAccess("canViewHealth")
  listImaging(@Param("petId") petId: string) {
    return this.imaging.list(petId);
  }

  @Get("referrals")
  @RequirePetAccess("canViewHealth")
  listReferrals(@Param("petId") petId: string) {
    return this.referrals.list(petId);
  }

  @Get("dental")
  @RequirePetAccess("canViewHealth")
  listDental(@Param("petId") petId: string) {
    return this.dental.list(petId);
  }

  @Get("nutrition")
  @RequirePetAccess("canViewHealth")
  listNutrition(@Param("petId") petId: string) {
    return this.nutrition.list(petId);
  }

  @Get("rehab")
  @RequirePetAccess("canViewHealth")
  listRehab(@Param("petId") petId: string) {
    return this.rehab.list(petId);
  }

  @Get("visits")
  @RequirePetAccess("canViewHealth")
  listVisits(@Param("petId") petId: string) {
    return this.visits.list(petId);
  }

  @Get("visits/:visitId")
  @RequirePetAccess("canViewHealth")
  getVisit(@Param("petId") petId: string, @Param("visitId") visitId: string) {
    return this.visits.get(petId, visitId);
  }

  @Get("care-plans")
  @RequirePetAccess("canViewHealth")
  listCarePlans(@Param("petId") petId: string) {
    return this.carePlans.list(petId);
  }

  @Get("senior-care")
  @RequirePetAccess("canViewHealth")
  listSeniorCare(@Param("petId") petId: string) {
    return this.seniorCare.list(petId);
  }

  @Post("senior-care")
  @RequirePetAccess("canEditHealth")
  addSeniorCareNote(@Param("petId") petId: string, @CurrentUser() user: SessionUser, @Body() dto: CreateSeniorCareNoteDto) {
    return this.seniorCare.addNote(petId, dto, { userId: user.id });
  }

  @Get("end-of-life")
  @RequirePetAccess("canViewHealth")
  getEndOfLife(@Param("petId") petId: string) {
    return this.endOfLife.get(petId);
  }

  @Post("end-of-life")
  @RequirePetAccess("canEditHealth")
  @HttpCode(HttpStatus.OK)
  upsertEndOfLife(@Param("petId") petId: string, @CurrentUser() user: SessionUser, @Body() dto: UpsertEndOfLifeCarePlanDto) {
    return this.endOfLife.upsert(petId, dto, { userId: user.id });
  }
}
