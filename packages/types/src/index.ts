// Shared domain types used across apps/api and apps/web.
// Keep in sync with apps/api/prisma/schema.prisma enums — this package has no
// runtime dependency on Prisma so it stays usable from the frontend.

export type Locale = "fa" | "en";
export type ThemePreference = "SYSTEM" | "LIGHT" | "DARK";

export enum PetSpecies {
  DOG = "DOG",
  CAT = "CAT",
}

export enum PetLifecycleStatus {
  ACTIVE = "ACTIVE",
  LOST = "LOST",
  TEMPORARILY_TRANSFERRED = "TEMPORARILY_TRANSFERRED",
  DECEASED = "DECEASED",
  MEMORIAL = "MEMORIAL",
}

export enum PetSex {
  MALE = "MALE",
  FEMALE = "FEMALE",
  UNKNOWN = "UNKNOWN",
}

export enum NeuteredStatus {
  NEUTERED = "NEUTERED",
  INTACT = "INTACT",
  UNKNOWN = "UNKNOWN",
}

export enum WeightUnit {
  KG = "KG",
  LB = "LB",
}

export enum HouseholdRole {
  OWNER = "OWNER",
  FAMILY = "FAMILY",
}

export enum PetAccessSource {
  HOUSEHOLD = "HOUSEHOLD",
  MANUAL = "MANUAL",
  TEMPORARY = "TEMPORARY",
}

export enum OnboardingChapter {
  ACCOUNT = "ACCOUNT",
  HOUSEHOLD = "HOUSEHOLD",
  PET_IDENTITY = "PET_IDENTITY",
  HEALTH_BASICS = "HEALTH_BASICS",
  PERSONALIZATION = "PERSONALIZATION",
  READY = "READY",
}

export enum OnboardingStatus {
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  SKIPPED = "SKIPPED",
}

export enum PetInterest {
  HEALTH = "HEALTH",
  VET = "VET",
  DAILY_CARE = "DAILY_CARE",
  SHOPPING = "SHOPPING",
  TRAINING = "TRAINING",
  TRAVEL = "TRAVEL",
  INSURANCE = "INSURANCE",
  ANIMAL_SUPPORT = "ANIMAL_SUPPORT",
}

export enum HomeActionKind {
  COMPLETE_HEALTH = "COMPLETE_HEALTH",
  VIEW_VACCINATION = "VIEW_VACCINATION",
  VIEW_MEDICATION = "VIEW_MEDICATION",
  COMPLETE_CARE_PROFILE = "COMPLETE_CARE_PROFILE",
  FIND_VET = "FIND_VET",
  VIEW_BOOKING = "VIEW_BOOKING",
  VIEW_PROFILE = "VIEW_PROFILE",
  ASK_AI = "ASK_AI",
}

// ---------------------------------------------------------------------------
// Health & Care (Handoff 02)
// ---------------------------------------------------------------------------

/** Shared "setup completeness" vocabulary for HealthProfile/NutritionProfile/CareProfile. */
export enum SetupStatus {
  NOT_STARTED = "NOT_STARTED",
  PARTIAL = "PARTIAL",
  COMPLETE = "COMPLETE",
}

/** Provenance for every health/care record. OWNER is the only source fully editable in this phase. */
export enum SourceType {
  OWNER = "OWNER",
  PROVIDER = "PROVIDER",
  IMPORTED_DOCUMENT = "IMPORTED_DOCUMENT",
  SYSTEM = "SYSTEM",
}

/** Per-domain state for allergies/conditions/medications when that list has zero rows. NULL on HealthProfile = Incomplete. */
export enum HealthAreaKnowledgeState {
  NONE_KNOWN = "NONE_KNOWN",
  UNKNOWN = "UNKNOWN",
}

/** Per-allergy-row confidence, distinct from HealthAreaKnowledgeState (which describes the list as a whole). */
export enum AllergyKnowledgeState {
  KNOWN = "KNOWN",
  UNKNOWN = "UNKNOWN",
}

export enum AllergyStatus {
  ACTIVE = "ACTIVE",
  RESOLVED = "RESOLVED",
}

/** Never inferred — always an explicit owner/provider choice. */
export enum AllergySeverity {
  MILD = "MILD",
  MODERATE = "MODERATE",
  SEVERE = "SEVERE",
  UNKNOWN = "UNKNOWN",
}

export enum ConditionStatus {
  ACTIVE = "ACTIVE",
  RESOLVED = "RESOLVED",
  HISTORICAL = "HISTORICAL",
}

export enum MedicationStatus {
  ACTIVE = "ACTIVE",
  SCHEDULED = "SCHEDULED",
  COMPLETED = "COMPLETED",
  HISTORICAL = "HISTORICAL",
}

/** UNKNOWN and INCOMPLETE are distinct and neither is ever derived as OVERDUE. */
export enum VaccinationStatus {
  UP_TO_DATE = "UP_TO_DATE",
  DUE_SOON = "DUE_SOON",
  OVERDUE = "OVERDUE",
  UNKNOWN = "UNKNOWN",
  INCOMPLETE = "INCOMPLETE",
}

export enum DietType {
  DRY = "DRY",
  WET = "WET",
  RAW = "RAW",
  MIXED = "MIXED",
  PRESCRIPTION = "PRESCRIPTION",
  OTHER = "OTHER",
  UNKNOWN = "UNKNOWN",
}

/**
 * Full severity vocabulary the architecture must support long-term. This
 * handoff only ever assigns NORMAL / INFORMATIONAL / ATTENTION.
 */
export enum HealthSeverity {
  NORMAL = "NORMAL",
  INFORMATIONAL = "INFORMATIONAL",
  ATTENTION = "ATTENTION",
  HIGHER_CONCERN = "HIGHER_CONCERN",
  URGENT = "URGENT",
  EMERGENCY = "EMERGENCY",
}

/**
 * The consumer-facing Known Negative / Unknown / Incomplete / Known Present
 * vocabulary for a list-backed health domain (allergies, conditions,
 * medications) as shown in HealthSummaryDto. Never collapsed to a boolean.
 */
export enum KnowledgeState {
  KNOWN_PRESENT = "KNOWN_PRESENT",
  KNOWN_NEGATIVE = "KNOWN_NEGATIVE",
  UNKNOWN = "UNKNOWN",
  INCOMPLETE = "INCOMPLETE",
}

export enum HealthAttentionType {
  VACCINATION_DUE = "VACCINATION_DUE",
  HEALTH_SETUP_INCOMPLETE = "HEALTH_SETUP_INCOMPLETE",
  CARE_PROFILE_INCOMPLETE = "CARE_PROFILE_INCOMPLETE",
}

/** Money is always an integer minor-unit amount + ISO currency code; never a float. */
export interface Money {
  amount: number;
  currency: string;
}

export interface PetAccessFlags {
  canViewIdentity: boolean;
  canEditIdentity: boolean;
  canViewHealth: boolean;
  canEditHealth: boolean;
  canBookCare: boolean;
  canViewCareProfile: boolean;
  canEditCareProfile: boolean;
  canViewLocation: boolean;
  canManageAccess: boolean;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
  };
}

export interface UserDto {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  avatarUrl: string | null;
  locale: Locale;
  themePreference: ThemePreference;
  createdAt: string;
  updatedAt: string;
}

export interface HouseholdDto {
  id: string;
  name: string | null;
  city: string | null;
  region: string | null;
  countryCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PetDto {
  id: string;
  householdId: string;
  name: string;
  species: PetSpecies;
  breed: string | null;
  sex: PetSex | null;
  birthDate: string | null;
  approximateAgeMonths: number | null;
  photoUrl: string | null;
  latestWeightValue: number | null;
  latestWeightUnit: WeightUnit | null;
  colorMarkings: string | null;
  neuteredStatus: NeuteredStatus | null;
  microchipNumber: string | null;
  lifecycleStatus: PetLifecycleStatus;
  createdAt: string;
  updatedAt: string;
}

export interface HomeActionDto {
  kind: HomeActionKind;
  labelKey: string;
  href: string;
}

export interface HomeResponseDto {
  activePet: PetDto | null;
  primaryAction: HomeActionDto;
  secondaryActions: HomeActionDto[];
}

// ---------------------------------------------------------------------------
// Health & Care DTOs (Handoff 02)
// ---------------------------------------------------------------------------

export interface HealthProfileDto {
  petId: string;
  status: SetupStatus;
  allergiesOverallState: HealthAreaKnowledgeState | null;
  conditionsOverallState: HealthAreaKnowledgeState | null;
  medicationsOverallState: HealthAreaKnowledgeState | null;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AllergyDto {
  id: string;
  petId: string;
  name: string;
  reaction: string | null;
  severity: AllergySeverity | null;
  knowledgeState: AllergyKnowledgeState;
  status: AllergyStatus;
  sourceType: SourceType;
  sourceLabel: string | null;
  recordedByUserId: string | null;
  recordedAt: string;
  updatedAt: string;
}

export interface ConditionDto {
  id: string;
  petId: string;
  name: string;
  status: ConditionStatus;
  notes: string | null;
  sourceType: SourceType;
  sourceLabel: string | null;
  recordedByUserId: string | null;
  firstRecordedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MedicationDto {
  id: string;
  petId: string;
  name: string;
  dosage: number | null;
  unit: string | null;
  frequencyText: string | null;
  route: string | null;
  status: MedicationStatus;
  startDate: string | null;
  endDate: string | null;
  instructions: string | null;
  sourceType: SourceType;
  sourceLabel: string | null;
  recordedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VaccinationSummaryDto {
  petId: string;
  status: VaccinationStatus;
  nextDueDate: string | null;
  lastKnownDate: string | null;
  notes: string | null;
  sourceType: SourceType;
  sourceLabel: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NutritionProfileDto {
  petId: string;
  dietType: DietType | null;
  currentFoodText: string | null;
  feedingFrequencyText: string | null;
  restrictionsText: string | null;
  status: SetupStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CareProfileDto {
  petId: string;
  temperamentText: string | null;
  aroundPeopleText: string | null;
  aroundAnimalsText: string | null;
  leashBehaviorText: string | null;
  handlingSensitivityText: string | null;
  feedingRoutineText: string | null;
  toiletRoutineText: string | null;
  separationBehaviorText: string | null;
  specialInstructionsText: string | null;
  status: SetupStatus;
  createdAt: string;
  updatedAt: string;
}

export interface HealthAttentionDto {
  type: HealthAttentionType;
  severity: HealthSeverity;
  titleKey: string;
  action: HomeActionKind;
}

/**
 * The one consumer-facing summary for Home/Pet Profile — HealthSummaryService
 * never exposes raw Allergy/Condition/Medication rows to those surfaces.
 */
export interface HealthSummaryDto {
  status: SetupStatus;
  allergyState: KnowledgeState;
  conditionsState: KnowledgeState;
  activeMedicationCount: number;
  medicationsState: KnowledgeState;
  vaccinationStatus: VaccinationStatus;
  nextVaccinationDueAt: string | null;
  primaryAttention: HealthAttentionDto | null;
}

// ---------------------------------------------------------------------------
// Find a Vet + Vet Booking Basics (Handoff 03)
// ---------------------------------------------------------------------------

export enum ProviderType {
  VET_CLINIC = "VET_CLINIC",
  VET_HOSPITAL = "VET_HOSPITAL",
  VETERINARIAN = "VETERINARIAN",
}

/** Only VERIFIED providers appear in default consumer discovery. */
export enum ProviderVerificationStatus {
  NOT_STARTED = "NOT_STARTED",
  SUBMITTED = "SUBMITTED",
  NEEDS_INFORMATION = "NEEDS_INFORMATION",
  UNDER_REVIEW = "UNDER_REVIEW",
  VERIFIED = "VERIFIED",
  REJECTED = "REJECTED",
  SUSPENDED = "SUSPENDED",
}

export enum ProviderUserRole {
  OWNER = "OWNER",
  VET = "VET",
  STAFF = "STAFF",
}

export enum ProviderServiceType {
  GENERAL_VET_VISIT = "GENERAL_VET_VISIT",
  VACCINATION = "VACCINATION",
  FOLLOW_UP = "FOLLOW_UP",
  CONSULTATION = "CONSULTATION",
}

/**
 * HOLD/PENDING_CONFIRMATION are part of the vocabulary but never the status
 * of a persisted Booking in this phase — see BookingHoldService and the
 * README. CHECKED_IN/IN_PROGRESS/COMPLETED/NO_SHOW/CANCELLED_BY_PROVIDER
 * exist for architecture completeness; no endpoint transitions a booking to
 * them yet.
 */
export enum BookingStatus {
  HOLD = "HOLD",
  PENDING_CONFIRMATION = "PENDING_CONFIRMATION",
  CONFIRMED = "CONFIRMED",
  CHECKED_IN = "CHECKED_IN",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED_BY_USER = "CANCELLED_BY_USER",
  CANCELLED_BY_PROVIDER = "CANCELLED_BY_PROVIDER",
  NO_SHOW = "NO_SHOW",
}

/** Deliberately separate from BookingStatus — see the doc comment in schema.prisma. */
export enum PaymentStatus {
  NOT_REQUIRED = "NOT_REQUIRED",
  PENDING = "PENDING",
  AUTHORIZED = "AUTHORIZED",
  PAID = "PAID",
  FAILED = "FAILED",
  REFUND_PENDING = "REFUND_PENDING",
  REFUNDED = "REFUNDED",
}

/** What a booking-confirmation-time TEMPORARY grant actually exposes — never "full health record" by default. */
export enum HealthAccessScopePreset {
  MINIMAL_VET_CONTEXT = "MINIMAL_VET_CONTEXT",
  HEALTH_BASICS = "HEALTH_BASICS",
  SELECTED_HEALTH_DATA = "SELECTED_HEALTH_DATA",
}

export enum CareCalendarEventType {
  VET_APPOINTMENT = "VET_APPOINTMENT",
}

export enum CareCalendarEventStatus {
  SCHEDULED = "SCHEDULED",
  CANCELLED = "CANCELLED",
  COMPLETED = "COMPLETED",
}

export interface ProviderLocationDto {
  id: string;
  providerOrganizationId: string;
  name: string | null;
  addressLine: string;
  city: string;
  region: string | null;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  timezone: string;
}

export interface ProviderServiceDto {
  id: string;
  providerOrganizationId: string;
  locationId: string | null;
  name: string;
  description: string | null;
  type: ProviderServiceType;
  durationMinutes: number;
  priceAmount: number | null;
  currency: string | null;
  supportsDog: boolean;
  supportsCat: boolean;
  isActive: boolean;
}

/** A search-result row — cheap-to-compute summary, not the full profile. */
export interface ProviderSummaryDto {
  id: string;
  name: string;
  type: ProviderType;
  verificationStatus: ProviderVerificationStatus;
  description: string | null;
  logoUrl: string | null;
  locations: ProviderLocationDto[];
  services: ProviderServiceDto[];
  nextAvailableSlotStart: string | null;
}

export interface ProviderProfileDto {
  id: string;
  name: string;
  type: ProviderType;
  verificationStatus: ProviderVerificationStatus;
  phone: string | null;
  email: string | null;
  description: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  locations: ProviderLocationDto[];
  services: ProviderServiceDto[];
}

export type SlotAvailabilityState = "AVAILABLE" | "BOOKED" | "BLOCKED";

export interface AvailabilitySlotDto {
  startAt: string;
  endAt: string;
  timezone: string;
  state: SlotAvailabilityState;
  providerUserId: string | null;
}

export interface AvailabilityResponseDto {
  slots: AvailabilitySlotDto[];
  /** false only when a petId was supplied and the service doesn't support that species. */
  petCompatible: boolean;
}

export interface BookingHoldDto {
  holdId: string;
  expiresAt: string;
  petId: string;
  providerOrganizationId: string;
  providerLocationId: string;
  providerUserId: string | null;
  providerServiceId: string;
  slotStart: string;
  slotEnd: string;
  timezone: string;
}

export interface BookingHealthAccessSummaryDto {
  scopePreset: HealthAccessScopePreset;
  expiresAt: string;
}

export interface BookingDto {
  id: string;
  householdId: string;
  petId: string;
  userId: string;
  providerOrganizationId: string;
  providerLocationId: string;
  providerUserId: string | null;
  providerServiceId: string;
  startAt: string;
  endAt: string;
  timezone: string;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  reasonForVisit: string | null;
  ownerNotes: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  createdAt: string;
  updatedAt: string;
  provider: ProviderSummaryDto | null;
  location: ProviderLocationDto | null;
  service: ProviderServiceDto | null;
  healthAccess: BookingHealthAccessSummaryDto | null;
}

export interface CareCalendarEventDto {
  id: string;
  householdId: string;
  petId: string;
  type: CareCalendarEventType;
  status: CareCalendarEventStatus;
  startAt: string;
  endAt: string;
  timezone: string;
  titleKey: string;
  actionType: string | null;
  bookingId: string;
}
