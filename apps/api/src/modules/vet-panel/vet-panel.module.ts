import { Module } from "@nestjs/common";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { ProviderOsModule } from "../provider-os/provider-os.module";
import { NotificationsModule } from "../notifications/notifications.module";
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
import { VetPanelNotificationListener } from "./vet-panel-notification.listener";
import { VetPanelOrgController, VetPanelPatientController } from "./vet-panel.controller";
import { VetPanelConsumerController } from "./vet-panel-consumer.controller";

/**
 * Handoff 24 — the veterinary practice layer. Deliberately its own module
 * rather than more files inside `clinical-health`: that module owns the
 * longitudinal *record* (Handoff 17), this one owns the day-to-day *practice*
 * (registry, whiteboard, treatment sheet, dispensing, estimates). It imports
 * `clinical-health`'s mapper functions directly but never its services, so
 * the dependency stays one-directional.
 */
@Module({
  imports: [PetAccessModule, ProviderOsModule, NotificationsModule],
  controllers: [VetPanelOrgController, VetPanelPatientController, VetPanelConsumerController],
  providers: [
    ProviderPatientRegistryService,
    ProviderPatientRecordService,
    ClinicalDashboardService,
    PatientVitalsService,
    ClinicalProblemService,
    PrescriptionService,
    HospitalizationService,
    ClinicalEstimateService,
    ClinicalNoteTemplateService,
    DischargeSummaryService,
    ProviderClinicalAlertService,
    VetPanelNotificationListener,
  ],
  exports: [PatientVitalsService, PrescriptionService, ClinicalEstimateService, DischargeSummaryService],
})
export class VetPanelModule {}
