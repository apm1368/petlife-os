import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { SubscriptionsModule } from "../subscriptions/subscription.module";
import { CareCalendarModule } from "../care-calendar/care-calendar.module";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { ProviderOsModule } from "../provider-os/provider-os.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { MedicalDocumentService } from "./medical-document.service";
import { MedicalRecordCorrectionService } from "./medical-record-correction.service";
import { LabResultService } from "./lab-result.service";
import { ImagingStudyService } from "./imaging-study.service";
import { ReferralService } from "./referral.service";
import { DentalRecordService } from "./dental-record.service";
import { ClinicalNutritionPlanService } from "./clinical-nutrition-plan.service";
import { RehabService } from "./rehab.service";
import { PetObservationService } from "./pet-observation.service";
import { ClinicalVisitService } from "./clinical-visit.service";
import { CarePlanService } from "./care-plan.service";
import { SeniorCareService } from "./senior-care.service";
import { EndOfLifeCareService } from "./end-of-life-care.service";
import { HealthTimelineService } from "./health-timeline.service";
import { HealthOverviewService } from "./health-overview.service";
import { ProviderClinicalPatientService } from "./provider-clinical-patient.service";
import { ClinicalHealthNotificationListener } from "./clinical-health-notification.listener";
import { HealthAdvancedController } from "./health-advanced.controller";
import { PetObservationController } from "./pet-observation.controller";
import { ProviderClinicalController } from "./provider-clinical.controller";

@Module({
  imports: [StorageModule, SubscriptionsModule, CareCalendarModule, PetAccessModule, ProviderOsModule, NotificationsModule],
  controllers: [HealthAdvancedController, PetObservationController, ProviderClinicalController],
  providers: [
    MedicalDocumentService,
    MedicalRecordCorrectionService,
    LabResultService,
    ImagingStudyService,
    ReferralService,
    DentalRecordService,
    ClinicalNutritionPlanService,
    RehabService,
    PetObservationService,
    ClinicalVisitService,
    CarePlanService,
    SeniorCareService,
    EndOfLifeCareService,
    HealthTimelineService,
    HealthOverviewService,
    ProviderClinicalPatientService,
    ClinicalHealthNotificationListener,
  ],
  exports: [MedicalDocumentService, HealthTimelineService, ClinicalVisitService, ReferralService],
})
export class ClinicalHealthModule {}
