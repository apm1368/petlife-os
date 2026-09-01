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
  GROOMER = "GROOMER",
  TRAINER = "TRAINER",
  WALKER = "WALKER",
  SITTER = "SITTER",
  BOARDING = "BOARDING",
  PET_TAXI = "PET_TAXI",
  MULTI_SERVICE_PROVIDER = "MULTI_SERVICE_PROVIDER",
}

/**
 * The canonical service taxonomy (Handoff 04) — deliberately independent of
 * ProviderType: a provider's `type` is coarse self-described business
 * identity, while every ProviderService carries its own `category` here,
 * never inferred from the org's type or a display string.
 */
export enum ServiceCategory {
  VET = "VET",
  GROOMING = "GROOMING",
  TRAINING = "TRAINING",
  WALKING = "WALKING",
  SITTING = "SITTING",
  BOARDING = "BOARDING",
  PET_TAXI = "PET_TAXI",
}

/** Where a booked service actually happens — see ProviderServiceDto.locationMode. */
export enum LocationMode {
  AT_PROVIDER = "AT_PROVIDER",
  AT_CUSTOMER = "AT_CUSTOMER",
  MOBILE = "MOBILE",
  TRANSPORT = "TRANSPORT",
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
  GROOMING_SESSION = "GROOMING_SESSION",
  TRAINING_SESSION = "TRAINING_SESSION",
  DOG_WALK = "DOG_WALK",
  PET_SITTING = "PET_SITTING",
  BOARDING_STAY = "BOARDING_STAY",
  PET_TAXI_RIDE = "PET_TAXI_RIDE",
}

/**
 * HOLD/PENDING_CONFIRMATION are part of the vocabulary but never the status
 * of a persisted Booking in this phase — see BookingHoldService and the
 * README. CHECKED_IN/IN_PROGRESS/COMPLETED/CANCELLED_BY_PROVIDER are now
 * reachable via the Provider OS (Handoff 05) — see ProviderBookingsService's
 * check-in/start/complete/cancel transitions. NO_SHOW remains part of the
 * vocabulary for architecture completeness only; no endpoint reaches it yet.
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

/**
 * What a booking-confirmation-time TEMPORARY grant actually exposes — never
 * "full health record"/"full Care Profile" by default. Renamed from
 * HealthAccessScopePreset (Handoff 03) now that booking access spans every
 * service category — the first three values are the original vet-only
 * presets, unchanged; the *_BASIC presets are the new per-category
 * Care-Profile-only presets (Handoff 04).
 */
export enum PetAccessScopePreset {
  MINIMAL_VET_CONTEXT = "MINIMAL_VET_CONTEXT",
  HEALTH_BASICS = "HEALTH_BASICS",
  SELECTED_HEALTH_DATA = "SELECTED_HEALTH_DATA",
  GROOMING_BASIC = "GROOMING_BASIC",
  TRAINING_BASIC = "TRAINING_BASIC",
  WALKING_BASIC = "WALKING_BASIC",
  SITTING_BASIC = "SITTING_BASIC",
  BOARDING_BASIC = "BOARDING_BASIC",
  TAXI_BASIC = "TAXI_BASIC",
}

/** Mirrors ServiceCategory — a calendar row's type is always derivable from the booking category that created it. */
export enum CareCalendarEventType {
  VET_APPOINTMENT = "VET_APPOINTMENT",
  GROOMING_APPOINTMENT = "GROOMING_APPOINTMENT",
  TRAINING_SESSION = "TRAINING_SESSION",
  WALK = "WALK",
  SITTING = "SITTING",
  BOARDING = "BOARDING",
  PET_TAXI = "PET_TAXI",
}

/** BookingSeries recurrence is intentionally minimal — a flat "repeat weekly N times" shape, no custom interval picker. */
export enum BookingSeriesFrequency {
  ONE_TIME = "ONE_TIME",
  WEEKLY = "WEEKLY",
}

/** PAUSED/COMPLETED exist for architecture completeness; only ACTIVE/CANCELLED are reachable this phase. */
export enum BookingSeriesStatus {
  ACTIVE = "ACTIVE",
  PAUSED = "PAUSED",
  CANCELLED = "CANCELLED",
  COMPLETED = "COMPLETED",
}

/**
 * PetServiceCompatibilityService's output vocabulary (Handoff 04 section 5).
 * NEEDS_REVIEW and UNKNOWN are deliberately distinct from NOT_SUPPORTED — a
 * service is never called compatible when required context (age, weight,
 * Care Profile, Health Basics) is simply missing rather than actually
 * disqualifying.
 */
export enum PetCompatibilityStatus {
  COMPATIBLE = "COMPATIBLE",
  NEEDS_REVIEW = "NEEDS_REVIEW",
  NOT_SUPPORTED = "NOT_SUPPORTED",
  UNKNOWN = "UNKNOWN",
}

/** Reason codes, not localized copy — the frontend maps each to display text. */
export type PetCompatibilityReason =
  | "SPECIES_UNSUPPORTED"
  | "AGE_TOO_YOUNG"
  | "AGE_TOO_OLD"
  | "AGE_UNKNOWN"
  | "WEIGHT_TOO_LOW"
  | "WEIGHT_TOO_HIGH"
  | "WEIGHT_UNKNOWN"
  | "CARE_PROFILE_REQUIRED"
  | "HEALTH_BASICS_REQUIRED";

export interface PetCompatibilityDto {
  status: PetCompatibilityStatus;
  reasons: PetCompatibilityReason[];
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
  category: ServiceCategory;
  durationMinutes: number;
  priceAmount: number | null;
  currency: string | null;
  supportsDog: boolean;
  supportsCat: boolean;
  minAgeMonths: number | null;
  maxAgeMonths: number | null;
  minWeightKg: number | null;
  maxWeightKg: number | null;
  requiresCareProfile: boolean;
  requiresHealthBasics: boolean;
  locationMode: LocationMode;
  isActive: boolean;
}

export interface CustomerAddressDto {
  id: string;
  householdId: string;
  label: string | null;
  recipient: string | null;
  phone: string | null;
  addressLine: string;
  city: string;
  region: string | null;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
  instructions: string | null;
}

/** A single (provider, service) discovery result row — one provider can appear multiple times, once per matching service. */
export interface ServiceSearchResultDto {
  provider: ProviderSummaryDto;
  service: ProviderServiceDto;
  location: ProviderLocationDto | null;
  /** Only present when the request carried a petId. */
  compatibility: PetCompatibilityDto | null;
  nextAvailableSlotStart: string | null;
}

export interface ServiceDetailDto {
  provider: ProviderProfileDto;
  service: ProviderServiceDto;
  locationOptions: ProviderLocationDto[];
  compatibility: PetCompatibilityDto | null;
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

/** Renamed from BookingHealthAccessSummaryDto — see PetAccessScopePreset. */
export interface BookingPetAccessSummaryDto {
  scopePreset: PetAccessScopePreset;
  expiresAt: string;
}

export interface BookingSeriesDto {
  id: string;
  householdId: string;
  petId: string;
  userId: string;
  providerOrganizationId: string;
  providerServiceId: string;
  frequency: BookingSeriesFrequency;
  status: BookingSeriesStatus;
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
  category: ServiceCategory;
  locationMode: LocationMode;
  startAt: string;
  endAt: string;
  timezone: string;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  reasonForVisit: string | null;
  ownerNotes: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  /** Handoff 05: set only by the Provider OS's POST .../complete transition. */
  completedAt: string | null;
  completedByProviderUserId: string | null;
  /** The deliberately small owner-visible summary (e.g. "Luna's grooming was completed.") — distinct from internal-only provider notes. */
  completionNote: string | null;
  createdAt: string;
  updatedAt: string;
  provider: ProviderSummaryDto | null;
  location: ProviderLocationDto | null;
  service: ProviderServiceDto | null;
  customerAddress: CustomerAddressDto | null;
  dropoffAddress: CustomerAddressDto | null;
  bookingSeriesId: string | null;
  petAccess: BookingPetAccessSummaryDto | null;
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

// ---------------------------------------------------------------------------
// Minimal Provider OS (Handoff 05)
// ---------------------------------------------------------------------------

/** BLOCKED closes an otherwise-available window (holiday, time off); AVAILABLE_OVERRIDE opens one the recurring rules don't cover. */
export enum AvailabilityExceptionType {
  BLOCKED = "BLOCKED",
  AVAILABLE_OVERRIDE = "AVAILABLE_OVERRIDE",
}

/** One row of `ProviderContextDto.memberships` — a user's membership in one provider organization. */
export interface ProviderMembershipSummaryDto {
  providerUserId: string;
  providerOrganizationId: string;
  organizationName: string;
  organizationType: ProviderType;
  verificationStatus: ProviderVerificationStatus;
  role: ProviderUserRole;
}

/**
 * `active` is null when the user has no provider membership at all, or has
 * more than one and has never explicitly chosen one (spec section 3: "do not
 * infer organization implicitly when multiple exist") — the Provider Shell
 * renders an organization picker in that case rather than guessing.
 */
export interface ProviderContextDto {
  active: ProviderMembershipSummaryDto | null;
  memberships: ProviderMembershipSummaryDto[];
}

export interface ProviderAvailabilityRuleDto {
  id: string;
  providerOrganizationId: string;
  locationId: string;
  providerUserId: string | null;
  serviceId: string | null;
  dayOfWeek: number;
  startLocalTime: string;
  endLocalTime: string;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  timezone: string;
}

export interface ProviderAvailabilityExceptionDto {
  id: string;
  providerOrganizationId: string;
  locationId: string;
  providerUserId: string | null;
  startAt: string;
  endAt: string;
  type: AvailabilityExceptionType;
  reason: string | null;
}

/** A compact booking-queue row (spec section 11) — never the full customer account profile. */
export interface ProviderBookingSummaryDto {
  id: string;
  petId: string;
  petName: string;
  petSpecies: PetSpecies;
  ownerDisplayName: string;
  category: ServiceCategory;
  serviceName: string;
  startAt: string;
  endAt: string;
  timezone: string;
  locationLabel: string;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  providerUserId: string | null;
}

/**
 * What the current provider user is actually permitted to see about this
 * booking's pet, resolved from the booking-linked PetAccessGrant (never a
 * different one) — "no invisible provider access" (spec section 14). state
 * is always one of these four explicit values; the frontend renders each
 * distinctly rather than a single boolean "hasAccess" that hides why.
 */
export interface ProviderPetAccessContextDto {
  state: "GRANTED" | "NO_GRANT" | "EXPIRED" | "REVOKED";
  scopePreset: PetAccessScopePreset | null;
  reason: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  canViewCareProfile: boolean;
  canViewHealth: boolean;
}

export interface ProviderBookingDetailDto {
  booking: ProviderBookingSummaryDto & {
    reasonForVisit: string | null;
    ownerNotes: string | null;
    cancelledAt: string | null;
    cancelledReason: string | null;
    completedAt: string | null;
    completedByProviderUserId: string | null;
    completionNote: string | null;
    createdAt: string;
    updatedAt: string;
  };
  pet: { id: string; name: string; species: PetSpecies; breed: string | null; photoUrl: string | null };
  access: ProviderPetAccessContextDto;
  careProfile: CareProfileDto | null;
  healthSummary: HealthSummaryDto | null;
  providerNotes: BookingProviderNoteDto[];
}

/** Internal-only — never sent to the customer. See Booking.completionNote for the small owner-visible counterpart. */
export interface BookingProviderNoteDto {
  id: string;
  bookingId: string;
  providerUserId: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/** Every ProviderUser row is implicitly active — no deactivation flow exists yet, so status is always this literal. */
export interface ProviderTeamMemberDto {
  providerUserId: string;
  displayName: string;
  role: ProviderUserRole;
  displayTitle: string | null;
  status: "ACTIVE";
  createdAt: string;
}

/** "What needs my attention today?" (spec section 5) — deliberately no vanity analytics. */
export interface ProviderOverviewDto {
  organization: { id: string; name: string; verificationStatus: ProviderVerificationStatus };
  /** The organization's first-created location — shown in the Provider Shell header (spec section 6). Orgs with more than one location this phase just show this one; picking a specific location per screen is deferred to the Availability/Schedule views themselves. */
  location: ProviderLocationDto | null;
  providerUser: { id: string; role: ProviderUserRole; displayTitle: string | null };
  todaysBookings: ProviderBookingSummaryDto[];
  nextBooking: ProviderBookingSummaryDto | null;
  pendingConfirmationCount: number;
  cancellationsRequiringAttentionCount: number;
  availabilityIssueCount: number;
  actionCounts: {
    today: number;
    upcoming: number;
    pendingConfirmation: number;
  };
}
