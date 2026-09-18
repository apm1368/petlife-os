import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { ProviderAuthGuard } from "../provider-os/auth/provider-auth.guard";
import { CurrentProviderContext } from "../provider-os/auth/current-provider-context.decorator";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { ProviderPatientRegistryService } from "./provider-patient-registry.service";
import { ProviderPatientRecordService } from "./provider-patient-record.service";
import { ClinicalDashboardService } from "./clinical-dashboard.service";
import { PatientVitalsService } from "./patient-vitals.service";
import { ClinicalProblemService } from "./clinical-problem.service";
import { PrescriptionService } from "./prescription.service";
import { HospitalizationService } from "./hospitalization.service";
import { ClinicalEstimateService } from "./clinical-estimate.service";
import { ClinicalNoteTemplateService } from "./note-template.service";
import { DischargeSummaryService } from "./discharge-summary.service";
import { ProviderClinicalAlertService } from "./provider-clinical-alert.service";
import { ListProviderPatientsQueryDto } from "./dto/patient-registry.dto";
import { CreateVitalsDto, ListVitalsQueryDto } from "./dto/vitals.dto";
import { CreateClinicalProblemDto, UpdateClinicalProblemDto } from "./dto/clinical-problem.dto";
import { CancelPrescriptionDto, CreatePrescriptionDto, DispenseRefillDto } from "./dto/prescription.dto";
import { AdmitPatientDto, CompleteTreatmentTaskDto, CreateTreatmentTasksDto, DischargePatientDto, ScheduleTreatmentSeriesDto, UpdateHospitalizationDto } from "./dto/hospitalization.dto";
import { CreateClinicalEstimateDto, PresentClinicalEstimateDto, UpdateClinicalEstimateDto } from "./dto/estimate.dto";
import { CreateNoteTemplateDto, UpdateNoteTemplateDto } from "./dto/note-template.dto";
import { UpsertDischargeSummaryDto } from "./dto/discharge-summary.dto";
import { CreateClinicalAlertDto } from "./dto/clinical-alert.dto";

/**
 * The veterinary clinical panel's provider surface.
 *
 * Guard stacking follows Handoff 17 exactly: `ProviderAuthGuard` resolves the
 * caller's organisation, and `PetAccessGuard` independently requires a
 * pet-level grant — org membership alone never reads a record. Authorship
 * routes require `canRecordClinicalData`, the flag only a VET-category
 * booking's grant ever carries; read routes require `canViewHealth`.
 *
 * Routes without a `:petId` segment (a prescription cancellation, a treatment
 * task action) carry `petId` in the body so `PetAccessGuard`'s existing
 * body-fallback still applies, and every service independently re-checks that
 * the target row really belongs to that pet — the same defence-in-depth
 * Handoff 17 established for nested clinical mutations.
 */
@Controller("provider/clinical")
@UseGuards(SessionAuthGuard, ProviderAuthGuard)
export class VetPanelOrgController {
  constructor(
    private readonly registry: ProviderPatientRegistryService,
    private readonly dashboard: ClinicalDashboardService,
    private readonly templates: ClinicalNoteTemplateService,
  ) {}

  /** The patient index — a directory, deliberately carrying no health data and never itself an authorization decision (see the service doc comment). */
  @Get("patients")
  listPatients(@CurrentProviderContext() ctx: ResolvedProviderContext, @Query() query: ListProviderPatientsQueryDto) {
    return this.registry.list(ctx, query);
  }

  @Get("dashboard")
  getDashboard(@CurrentProviderContext() ctx: ResolvedProviderContext) {
    return this.dashboard.get(ctx);
  }

  @Get("note-templates")
  listTemplates(@CurrentProviderContext() ctx: ResolvedProviderContext, @Query("includeInactive") includeInactive?: string) {
    return this.templates.list(ctx, includeInactive === "true");
  }

  @Post("note-templates")
  createTemplate(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: CreateNoteTemplateDto) {
    return this.templates.create(ctx, dto);
  }

  @Patch("note-templates/:templateId")
  updateTemplate(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("templateId") templateId: string, @Body() dto: UpdateNoteTemplateDto) {
    return this.templates.update(ctx, templateId, dto);
  }
}

/** Everything scoped to one patient. Split from the org controller purely so `PetAccessGuard` never runs on a route that has no pet to check. */
@Controller("provider/clinical")
@UseGuards(SessionAuthGuard, ProviderAuthGuard, PetAccessGuard)
export class VetPanelPatientController {
  constructor(
    private readonly record: ProviderPatientRecordService,
    private readonly vitals: PatientVitalsService,
    private readonly problems: ClinicalProblemService,
    private readonly prescriptions: PrescriptionService,
    private readonly hospitalizations: HospitalizationService,
    private readonly estimates: ClinicalEstimateService,
    private readonly discharge: DischargeSummaryService,
    private readonly alerts: ProviderClinicalAlertService,
  ) {}

  // --- Patient record ------------------------------------------------------

  @Get("patients/:petId")
  @RequirePetAccess("canViewHealth")
  getPatient(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("petId") petId: string) {
    return this.record.get(ctx, petId);
  }

  // --- Vitals --------------------------------------------------------------

  @Get("patients/:petId/vitals")
  @RequirePetAccess("canViewHealth")
  listVitals(@Param("petId") petId: string, @Query() query: ListVitalsQueryDto) {
    return this.vitals.list(petId, query.limit);
  }

  @Get("patients/:petId/vitals/trends")
  @RequirePetAccess("canViewHealth")
  vitalsTrends(@Param("petId") petId: string) {
    return this.vitals.trends(petId);
  }

  @Post("vitals")
  @RequirePetAccess("canRecordClinicalData")
  recordVitals(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: CreateVitalsDto) {
    return this.vitals.create(ctx, dto);
  }

  // --- Problem list --------------------------------------------------------

  @Get("patients/:petId/problems")
  @RequirePetAccess("canViewHealth")
  listProblems(@Param("petId") petId: string) {
    return this.problems.list(petId);
  }

  @Post("problems")
  @RequirePetAccess("canRecordClinicalData")
  createProblem(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: CreateClinicalProblemDto) {
    return this.problems.create(ctx, dto);
  }

  @Patch("patients/:petId/problems/:problemId")
  @RequirePetAccess("canRecordClinicalData")
  updateProblem(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("petId") petId: string, @Param("problemId") problemId: string, @Body() dto: UpdateClinicalProblemDto) {
    return this.problems.update(ctx, petId, problemId, dto);
  }

  // --- Prescriptions -------------------------------------------------------

  @Get("patients/:petId/prescriptions")
  @RequirePetAccess("canViewHealth")
  listPrescriptions(@Param("petId") petId: string) {
    return this.prescriptions.list(petId, "PROVIDER");
  }

  @Post("prescriptions")
  @RequirePetAccess("canRecordClinicalData")
  createPrescription(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: CreatePrescriptionDto) {
    return this.prescriptions.create(ctx, dto);
  }

  @Post("prescriptions/:prescriptionId/cancel")
  @RequirePetAccess("canRecordClinicalData")
  cancelPrescription(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("prescriptionId") prescriptionId: string, @Body() dto: CancelPrescriptionDto) {
    return this.prescriptions.cancel(ctx, prescriptionId, dto);
  }

  @Post("prescriptions/:prescriptionId/refill")
  @RequirePetAccess("canRecordClinicalData")
  dispenseRefill(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("prescriptionId") prescriptionId: string, @Body() dto: DispenseRefillDto) {
    return this.prescriptions.dispenseRefill(ctx, prescriptionId, dto);
  }

  // --- Hospitalization + treatment sheet -----------------------------------

  @Get("patients/:petId/hospitalizations")
  @RequirePetAccess("canViewHealth")
  listHospitalizations(@Param("petId") petId: string) {
    return this.hospitalizations.listForPet(petId);
  }

  @Get("patients/:petId/hospitalizations/:hospitalizationId")
  @RequirePetAccess("canViewHealth")
  getHospitalization(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("petId") petId: string, @Param("hospitalizationId") hospitalizationId: string) {
    return this.hospitalizations.get(ctx, petId, hospitalizationId);
  }

  @Post("hospitalizations")
  @RequirePetAccess("canRecordClinicalData")
  admit(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: AdmitPatientDto) {
    return this.hospitalizations.admit(ctx, dto);
  }

  @Patch("hospitalizations/:hospitalizationId")
  @RequirePetAccess("canRecordClinicalData")
  updateHospitalization(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("hospitalizationId") hospitalizationId: string, @Body() dto: UpdateHospitalizationDto) {
    return this.hospitalizations.update(ctx, hospitalizationId, dto);
  }

  @Post("hospitalizations/:hospitalizationId/discharge")
  @RequirePetAccess("canRecordClinicalData")
  dischargePatient(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("hospitalizationId") hospitalizationId: string, @Body() dto: DischargePatientDto) {
    return this.hospitalizations.discharge(ctx, hospitalizationId, dto);
  }

  @Post("hospitalizations/:hospitalizationId/tasks")
  @RequirePetAccess("canRecordClinicalData")
  addTasks(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("hospitalizationId") hospitalizationId: string, @Body() dto: CreateTreatmentTasksDto) {
    return this.hospitalizations.addTasks(ctx, hospitalizationId, dto);
  }

  @Post("hospitalizations/:hospitalizationId/task-series")
  @RequirePetAccess("canRecordClinicalData")
  scheduleSeries(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("hospitalizationId") hospitalizationId: string, @Body() dto: ScheduleTreatmentSeriesDto) {
    return this.hospitalizations.scheduleSeries(ctx, hospitalizationId, dto);
  }

  @Post("hospitalizations/:hospitalizationId/tasks/:taskId/action")
  @RequirePetAccess("canRecordClinicalData")
  actionTask(
    @CurrentProviderContext() ctx: ResolvedProviderContext,
    @Param("hospitalizationId") hospitalizationId: string,
    @Param("taskId") taskId: string,
    @Body() dto: CompleteTreatmentTaskDto,
  ) {
    return this.hospitalizations.actionTask(ctx, hospitalizationId, taskId, dto);
  }

  // --- Estimates -----------------------------------------------------------

  @Get("patients/:petId/estimates")
  @RequirePetAccess("canViewHealth")
  listEstimates(@Param("petId") petId: string) {
    return this.estimates.listForPet(petId);
  }

  @Post("estimates")
  @RequirePetAccess("canRecordClinicalData")
  createEstimate(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: CreateClinicalEstimateDto) {
    return this.estimates.create(ctx, dto);
  }

  @Patch("estimates/:estimateId")
  @RequirePetAccess("canRecordClinicalData")
  updateEstimate(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("estimateId") estimateId: string, @Body() dto: UpdateClinicalEstimateDto) {
    return this.estimates.update(ctx, estimateId, dto);
  }

  /** Presenting freezes the numbers. Approving is the owner's action alone — there is deliberately no provider route for it. */
  @Post("estimates/:estimateId/present")
  @RequirePetAccess("canRecordClinicalData")
  presentEstimate(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("estimateId") estimateId: string, @Body() dto: PresentClinicalEstimateDto) {
    return this.estimates.present(ctx, dto.petId, estimateId);
  }

  // --- Discharge summary ---------------------------------------------------

  @Get("patients/:petId/visits/:visitId/discharge-summary")
  @RequirePetAccess("canViewHealth")
  getDischargeSummary(@Param("petId") petId: string, @Param("visitId") visitId: string) {
    return this.discharge.getForVisit(petId, visitId);
  }

  @Post("patients/:petId/visits/:visitId/discharge-summary")
  @RequirePetAccess("canRecordClinicalData")
  saveDischargeSummary(
    @CurrentProviderContext() ctx: ResolvedProviderContext,
    @Param("petId") petId: string,
    @Param("visitId") visitId: string,
    @Body() dto: UpsertDischargeSummaryDto,
  ) {
    return this.discharge.upsertDraft(ctx, petId, visitId, dto);
  }

  @Post("patients/:petId/visits/:visitId/discharge-summary/issue")
  @RequirePetAccess("canRecordClinicalData")
  issueDischargeSummary(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("petId") petId: string, @Param("visitId") visitId: string) {
    return this.discharge.issue(ctx, petId, visitId);
  }

  // --- Staff-safety alerts -------------------------------------------------

  @Get("patients/:petId/alerts")
  @RequirePetAccess("canViewHealth")
  listAlerts(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("petId") petId: string, @Query("includeResolved") includeResolved?: string) {
    return this.alerts.list(ctx, petId, includeResolved === "true");
  }

  @Post("alerts")
  @RequirePetAccess("canRecordClinicalData")
  createAlert(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: CreateClinicalAlertDto) {
    return this.alerts.create(ctx, dto);
  }

  @Post("patients/:petId/alerts/:alertId/resolve")
  @RequirePetAccess("canRecordClinicalData")
  resolveAlert(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("petId") petId: string, @Param("alertId") alertId: string) {
    return this.alerts.resolve(ctx, petId, alertId);
  }
}
