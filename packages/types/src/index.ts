// Shared domain types used across apps/api and apps/web.
// Keep in sync with apps/api/prisma/schema.prisma enums — this package has no
// runtime dependency on Prisma so it stays usable from the frontend.

export type Locale = "fa" | "en";
export type ThemePreference = "SYSTEM" | "LIGHT" | "DARK";

/** Simple offset pagination envelope (Handoff 09) used by every Seller OS list endpoint — spec section 69-70: "avoid N+1 queries... never return an entire seller catalog in one unbounded response". */
export interface PaginatedDto<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

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
  /** Handoff 18 memorial mode — the primary Home action for a DECEASED/MEMORIAL pet, replacing every commercial/operational nudge (spec: "no Buy again/Book now CTA on memorial-focused surfaces"). */
  VIEW_MEMORIES = "VIEW_MEMORIES",
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

/** Provenance for every health/care record. OWNER is the only source fully editable in this phase. Handoff 17 adds HOUSEHOLD_MEMBER and CLINIC (additive only). */
export enum SourceType {
  OWNER = "OWNER",
  HOUSEHOLD_MEMBER = "HOUSEHOLD_MEMBER",
  PROVIDER = "PROVIDER",
  CLINIC = "CLINIC",
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
  /** Handoff 17: authority to author clinical content (visits, documents, labs, imaging, referrals, care plans) for this pet as a provider. */
  canRecordClinicalData: boolean;
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

// ---------------------------------------------------------------------------
// Commerce Core (Handoff 06)
// ---------------------------------------------------------------------------

export enum SellerVerificationStatus {
  NOT_STARTED = "NOT_STARTED",
  SUBMITTED = "SUBMITTED",
  NEEDS_INFORMATION = "NEEDS_INFORMATION",
  UNDER_REVIEW = "UNDER_REVIEW",
  VERIFIED = "VERIFIED",
  REJECTED = "REJECTED",
  SUSPENDED = "SUSPENDED",
}

export enum SellerStatus {
  PENDING = "PENDING",
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  SUSPENDED = "SUSPENDED",
  RESTRICTED = "RESTRICTED",
  CLOSED = "CLOSED",
}

export enum ProductStatus {
  DRAFT = "DRAFT",
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  ARCHIVED = "ARCHIVED",
}

export enum ProductCategoryStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
}

export enum BrandStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
}

export enum SellerOfferStatus {
  ACTIVE = "ACTIVE",
  PAUSED = "PAUSED",
  OUT_OF_STOCK = "OUT_OF_STOCK",
  SUSPENDED = "SUSPENDED",
}

export enum CartStatus {
  ACTIVE = "ACTIVE",
  CONVERTED = "CONVERTED",
  ABANDONED = "ABANDONED",
}

/** PARTIALLY_CONFIRMED exists for the "N orders, not all succeed" case; unreached this phase — see README Known limitations. */
export enum CheckoutStatus {
  DRAFT = "DRAFT",
  READY_FOR_PAYMENT = "READY_FOR_PAYMENT",
  PAYMENT_PENDING = "PAYMENT_PENDING",
  CONFIRMED = "CONFIRMED",
  PARTIALLY_CONFIRMED = "PARTIALLY_CONFIRMED",
  FAILED = "FAILED",
  EXPIRED = "EXPIRED",
  /** Handoff 07 — payment/financing was approved but Order confirmation itself failed (e.g. inventory unavailable). See README "Paid but order cannot confirm". */
  PAYMENT_SUCCEEDED_ORDER_ISSUE = "PAYMENT_SUCCEEDED_ORDER_ISSUE",
}

/** Handoff 07 — chosen once, before a PaymentIntent (ONLINE_PAYMENT) or FinancingIntent (INSTALLMENTS) exists for the checkout. */
export enum PaymentMethodType {
  ONLINE_PAYMENT = "ONLINE_PAYMENT",
  INSTALLMENTS = "INSTALLMENTS",
}

export enum InventoryReservationStatus {
  ACTIVE = "ACTIVE",
  CONSUMED = "CONSUMED",
  RELEASED = "RELEASED",
  EXPIRED = "EXPIRED",
}

/** PREPARING/READY_FOR_FULFILLMENT/FULFILLED/PARTIALLY_REFUNDED/REFUNDED are modeled but unreachable this phase — only PENDING/CONFIRMED/CANCELLED are. */
export enum OrderStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  PREPARING = "PREPARING",
  READY_FOR_FULFILLMENT = "READY_FOR_FULFILLMENT",
  FULFILLED = "FULFILLED",
  CANCELLED = "CANCELLED",
  PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED",
  REFUNDED = "REFUNDED",
}

export enum DeliveryMethod {
  STANDARD = "STANDARD",
  EXPRESS = "EXPRESS",
}

export enum PaymentIntentStatus {
  REQUIRES_PAYMENT_METHOD = "REQUIRES_PAYMENT_METHOD",
  PENDING = "PENDING",
  AUTHORIZED = "AUTHORIZED",
  CAPTURED = "CAPTURED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

/** Handoff 07 adds STANDARD_GATEWAY/SNAPP_PAY/DIGI_PAY to the DEV_SIMULATED-only Handoff 06 registry — see README "Provider adapter architecture". */
export enum PaymentProvider {
  DEV_SIMULATED = "DEV_SIMULATED",
  STANDARD_GATEWAY = "STANDARD_GATEWAY",
  SNAPP_PAY = "SNAPP_PAY",
  DIGI_PAY = "DIGI_PAY",
}

export enum PaymentAttemptStatus {
  STARTED = "STARTED",
  PENDING = "PENDING",
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export enum TransactionType {
  CHARGE = "CHARGE",
  REFUND = "REFUND",
}

export enum TransactionStatus {
  PENDING = "PENDING",
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
}

/**
 * BNPL/financing state machine (Handoff 07, spec section 4) — deliberately
 * separate from PaymentIntentStatus (spec section 6: "do not collapse into
 * one payment status"). A FinancingIntent never reaches CAPTURED/AUTHORIZED.
 */
export enum FinancingIntentStatus {
  CREATED = "CREATED",
  ELIGIBILITY_PENDING = "ELIGIBILITY_PENDING",
  ELIGIBLE = "ELIGIBLE",
  NOT_ELIGIBLE = "NOT_ELIGIBLE",
  PLAN_SELECTED = "PLAN_SELECTED",
  AUTHORIZATION_PENDING = "AUTHORIZATION_PENDING",
  APPROVED = "APPROVED",
  DECLINED = "DECLINED",
  CANCELLED = "CANCELLED",
  EXPIRED = "EXPIRED",
  REFUND_PENDING = "REFUND_PENDING",
  PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED",
  REFUNDED = "REFUNDED",
}

/** Pre-check eligibility vocabulary (spec section 12) — never faked for a provider that doesn't support pre-check; that provider's flow skips straight to authorization. */
export enum FinancingEligibilityStatus {
  CHECKING = "CHECKING",
  ELIGIBLE = "ELIGIBLE",
  NOT_ELIGIBLE = "NOT_ELIGIBLE",
  NEEDS_VERIFICATION = "NEEDS_VERIFICATION",
  ERROR = "ERROR",
}

export enum RefundStatus {
  REQUESTED = "REQUESTED",
  PROCESSING = "PROCESSING",
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

/** A raw provider webhook delivery's own processing state (Handoff 07, spec section 17) — independent of whatever PaymentIntent/FinancingIntent status it ultimately caused. */
export enum ProviderEventStatus {
  RECEIVED = "RECEIVED",
  PROCESSED = "PROCESSED",
  FAILED = "FAILED",
  IGNORED_DUPLICATE = "IGNORED_DUPLICATE",
}

/** Initial conceptual chart of accounts (spec section 31) — SELLER_PAYABLE/PLATFORM_REVENUE are seeded placeholders only; nothing posts to them this phase. */
export enum LedgerAccountCode {
  CASH_GATEWAY_RECEIVABLE = "CASH_GATEWAY_RECEIVABLE",
  CUSTOMER_PAYMENT_CLEARING = "CUSTOMER_PAYMENT_CLEARING",
  SELLER_PAYABLE = "SELLER_PAYABLE",
  REFUND_PAYABLE = "REFUND_PAYABLE",
  PLATFORM_REVENUE = "PLATFORM_REVENUE",
}

export enum LedgerEntryDirection {
  DEBIT = "DEBIT",
  CREDIT = "CREDIT",
}

/**
 * Provider capability metadata (spec section 3) — the frontend/backend both
 * branch on these flags, never on provider identity directly, so adding a
 * fifth provider later never means a new `if (provider === ...)` anywhere in
 * product code.
 */
export interface ProviderCapabilities {
  supportsDirectPayment: boolean;
  supportsInstallments: boolean;
  supportsRefund: boolean;
  supportsPartialRefund: boolean;
  supportsAsyncWebhook: boolean;
  supportsEligibilityCheck: boolean;
}

export interface PaymentMethodOptionDto {
  provider: PaymentProvider;
  methodType: PaymentMethodType;
  capabilities: ProviderCapabilities;
}

export interface FinancingPlanOptionDto {
  providerPlanId: string;
  installmentCount: number;
  downPaymentAmount: number | null;
  installmentAmount: number | null;
  feeAmount: number | null;
  totalPayableAmount: number;
  currency: string;
  firstDueAt: string | null;
}

export interface FinancingPlanSnapshotDto extends FinancingPlanOptionDto {
  id: string;
}

export interface FinancingIntentDto {
  id: string;
  checkoutId: string;
  provider: PaymentProvider;
  amount: number;
  currency: string;
  status: FinancingIntentStatus;
  eligibility: FinancingEligibilityStatus | null;
  availablePlans: FinancingPlanOptionDto[];
  selectedPlan: FinancingPlanSnapshotDto | null;
  failureCode?: string;
  failureMessage?: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RefundDto {
  id: string;
  paymentIntentId: string | null;
  financingIntentId: string | null;
  orderId: string | null;
  amount: number;
  currency: string;
  status: RefundStatus;
  reason: string | null;
  providerReference: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

/**
 * ProductCompatibilityService's output vocabulary (spec section 11).
 * POTENTIAL_SAFETY_CONFLICT always outranks every other state, including a
 * discount/promotion/sponsored placement (spec section 13) — the frontend
 * must never let a user miss it. NEEDS_REVIEW/UNKNOWN cover missing data;
 * the service never defaults to COMPATIBLE when a required fact (age,
 * weight, allergy data) is simply unknown rather than actually confirmed.
 */
export enum ProductCompatibilityStatus {
  COMPATIBLE = "COMPATIBLE",
  LIKELY_COMPATIBLE = "LIKELY_COMPATIBLE",
  NEEDS_REVIEW = "NEEDS_REVIEW",
  NOT_RECOMMENDED = "NOT_RECOMMENDED",
  POTENTIAL_SAFETY_CONFLICT = "POTENTIAL_SAFETY_CONFLICT",
  UNKNOWN = "UNKNOWN",
}

/** Reason codes, not localized copy — the frontend maps each to display text, mirroring PetCompatibilityReason (Handoff 04). */
export type ProductCompatibilityReason =
  | "SPECIES_MISMATCH"
  | "AGE_TOO_YOUNG"
  | "AGE_TOO_OLD"
  | "AGE_UNKNOWN"
  | "WEIGHT_TOO_LOW"
  | "WEIGHT_TOO_HIGH"
  | "WEIGHT_UNKNOWN"
  | "ALLERGEN_CONFLICT"
  | "HEALTH_REVIEW_REQUIRED"
  | "NO_ACTIVE_PET";

export interface ProductCompatibilityDto {
  status: ProductCompatibilityStatus;
  reasons: ProductCompatibilityReason[];
}

export interface BrandDto {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  status: BrandStatus;
}

export interface ProductCategoryDto {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  status: ProductCategoryStatus;
}

export interface ProductVariantDto {
  id: string;
  productId: string;
  sku: string;
  barcode: string | null;
  title: string | null;
  attributes: Record<string, string> | null;
  weightValue: number | null;
  weightUnit: WeightUnit | null;
  isActive: boolean;
}

export interface SellerOrganizationSummaryDto {
  id: string;
  name: string;
  verificationStatus: SellerVerificationStatus;
  status: SellerStatus;
  city: string | null;
}

export interface SellerOfferDto {
  id: string;
  sellerOrganization: SellerOrganizationSummaryDto;
  productVariantId: string;
  priceAmount: number;
  compareAtAmount: number | null;
  currency: string;
  status: SellerOfferStatus;
  /** onHand - reserved, computed server-side, never a stored column. */
  availableQuantity: number;
}

/** One (product, variant) discovery/listing row — the cheapest ACTIVE offer is `bestOffer`; every ACTIVE offer is in `offers`. */
export interface ProductSummaryDto {
  id: string;
  title: string;
  slug: string;
  brand: BrandDto | null;
  category: ProductCategoryDto;
  variantId: string;
  variantTitle: string | null;
  bestOffer: SellerOfferDto | null;
  /** Only present when the request carried a petId. */
  compatibility: ProductCompatibilityDto | null;
}

export interface ProductDetailDto {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  brand: BrandDto | null;
  category: ProductCategoryDto;
  status: ProductStatus;
  variants: ProductVariantDto[];
  /** All ACTIVE offers across all variants, for the offer-selection step. */
  offers: SellerOfferDto[];
  compatibility: ProductCompatibilityDto | null;
}

export interface CartLineDto {
  id: string;
  sellerOffer: SellerOfferDto;
  productId: string;
  productTitle: string;
  variantTitle: string | null;
  variantSku: string;
  targetPetId: string | null;
  targetPetName: string | null;
  quantity: number;
  unitPriceSnapshot: number;
  currentPriceAmount: number;
  priceChanged: boolean;
  currency: string;
  lineTotal: number;
  compatibility: ProductCompatibilityDto | null;
}

export interface CartSellerGroupDto {
  sellerOrganization: SellerOrganizationSummaryDto;
  lines: CartLineDto[];
  subtotalAmount: number;
}

export interface CartDto {
  id: string;
  status: CartStatus;
  sellerGroups: CartSellerGroupDto[];
  totalItems: number;
  subtotalAmount: number;
  currency: string;
  hasSafetyConflict: boolean;
}

export interface CheckoutValidationIssueDto {
  code: string;
  cartLineId: string | null;
  message: string;
}

export interface CheckoutDto {
  id: string;
  status: CheckoutStatus;
  addressId: string | null;
  deliveryMethod: DeliveryMethod;
  paymentMethodType: PaymentMethodType | null;
  subtotalAmount: number;
  deliveryAmount: number;
  discountAmount: number;
  totalAmount: number;
  currency: string;
  sellerGroups: CartSellerGroupDto[];
  expiresAt: string | null;
  validationIssues: CheckoutValidationIssueDto[];
  createdAt: string;
  updatedAt: string;
}

export interface PayCheckoutResultDto {
  checkout: CheckoutDto;
  paymentStatus: "SUCCEEDED" | "FAILED" | "PENDING";
  failureCode?: string;
  failureMessage?: string;
  orderIds: string[];
}

export interface PaymentIntentDto {
  id: string;
  checkoutId: string;
  amount: number;
  currency: string;
  status: PaymentIntentStatus;
  provider: PaymentProvider;
}

export interface OrderItemDto {
  id: string;
  productId: string;
  productVariantId: string;
  productTitleSnapshot: string;
  variantTitleSnapshot: string | null;
  skuSnapshot: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  targetPetId: string | null;
  compatibilitySnapshot: ProductCompatibilityDto | null;
}

/**
 * Handoff 07 (spec section 42): Order/Payment/Financing/Refund states are
 * always shown separately, never collapsed into one ambiguous badge.
 * `paymentStatus`/`financingStatus` reflect the checkout's own latest
 * PaymentIntent/FinancingIntent (an Order never stores its own copy of
 * these — see README); `refundStatus` is this Order's own most recent
 * Refund, if any.
 */
export interface OrderSummaryDto {
  id: string;
  /** Null for a marketplace-origin Order (Handoff 09) — see MarketplaceOrder. */
  checkoutId: string | null;
  sellerOrganization: SellerOrganizationSummaryDto;
  status: OrderStatus;
  paymentStatus: PaymentIntentStatus | null;
  financingStatus: FinancingIntentStatus | null;
  refundStatus: RefundStatus | null;
  fulfillmentStatus: FulfillmentStatus | null;
  itemCount: number;
  totalAmount: number;
  currency: string;
  createdAt: string;
  confirmedAt: string | null;
}

export interface OrderDetailDto {
  id: string;
  /** Null for a marketplace-origin Order (Handoff 09) — see MarketplaceOrder. */
  checkoutId: string | null;
  sellerOrganization: SellerOrganizationSummaryDto;
  status: OrderStatus;
  paymentStatus: PaymentIntentStatus | null;
  financingStatus: FinancingIntentStatus | null;
  refunds: RefundDto[];
  fulfillment: FulfillmentDto | null;
  subtotalAmount: number;
  deliveryAmount: number;
  discountAmount: number;
  totalAmount: number;
  currency: string;
  shippingAddress: CustomerAddressDto | null;
  items: OrderItemDto[];
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
}

/** Minimal internal payment-ops view (spec section 45) — reachable only by the checkout's own owner (no real admin/support role exists yet; see README Known limitations). */
export interface PaymentProviderEventDto {
  id: string;
  provider: PaymentProvider;
  providerEventId: string;
  eventType: string;
  status: ProviderEventStatus;
  receivedAt: string;
  processedAt: string | null;
  attemptCount: number;
  lastError: string | null;
}

export interface ReconciliationLogDto {
  id: string;
  provider: PaymentProvider;
  referenceType: "PAYMENT_INTENT" | "FINANCING_INTENT";
  referenceId: string;
  localStatus: string;
  remoteStatus: string;
  action: "NONE" | "RESOLVED_SUCCEEDED" | "RESOLVED_FAILED" | "UNKNOWN_REMOTE_STATE";
  createdAt: string;
}

export interface PaymentAttemptDto {
  id: string;
  paymentIntentId: string;
  provider: PaymentProvider;
  providerReference: string | null;
  status: PaymentAttemptStatus;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface TransactionDto {
  id: string;
  paymentIntentId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  status: TransactionStatus;
  createdAt: string;
}

export interface CheckoutOpsDto {
  checkout: CheckoutDto;
  paymentIntents: PaymentIntentDto[];
  paymentAttempts: PaymentAttemptDto[];
  transactions: TransactionDto[];
  financingIntents: FinancingIntentDto[];
  refunds: RefundDto[];
  providerEvents: PaymentProviderEventDto[];
  reconciliationLogs: ReconciliationLogDto[];
}

// ---------------------------------------------------------------------------
// Delivery & Logistics Core (Handoff 08)
// ---------------------------------------------------------------------------

/** Mirrors the backend's PaymentProvider-shaped registry (spec section 1) — DEV plus two real-provider adapter boundaries. See README "Provider integration status" for what is real vs. stubbed for ALOPEYK/SNAPPBOX. */
export enum ShippingProvider {
  DEV = "DEV",
  ALOPEYK = "ALOPEYK",
  SNAPPBOX = "SNAPPBOX",
}

export enum FulfillmentStatus {
  PENDING = "PENDING",
  AWAITING_SELLER_PREPARATION = "AWAITING_SELLER_PREPARATION",
  READY_FOR_PICKUP = "READY_FOR_PICKUP",
  PICKUP_REQUESTED = "PICKUP_REQUESTED",
  PICKUP_ASSIGNED = "PICKUP_ASSIGNED",
  PICKED_UP = "PICKED_UP",
  IN_TRANSIT = "IN_TRANSIT",
  OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY",
  DELIVERED = "DELIVERED",
  FAILED = "FAILED",
  CANCELED = "CANCELED",
}

/** Canonical, provider-normalized status only (spec section 6) — a raw provider status string is never part of this vocabulary. UNKNOWN is explicit and must never be read as success. */
export enum ShipmentStatus {
  CREATED = "CREATED",
  REQUESTED = "REQUESTED",
  ASSIGNED = "ASSIGNED",
  PICKED_UP = "PICKED_UP",
  IN_TRANSIT = "IN_TRANSIT",
  OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY",
  DELIVERED = "DELIVERED",
  FAILED = "FAILED",
  CANCELED = "CANCELED",
  UNKNOWN = "UNKNOWN",
}

export enum ShippingQuoteStatus {
  AVAILABLE = "AVAILABLE",
  UNAVAILABLE = "UNAVAILABLE",
  EXPIRED = "EXPIRED",
  SELECTED = "SELECTED",
}

/**
 * A pickup/delivery address as it was snapshotted at Fulfillment/Shipment
 * creation time (spec section 8) — deliberately not `CustomerAddressDto`
 * (which requires a live `id`/`householdId`): a seller pickup location has
 * neither, and a snapshot must keep reading the same way even after the
 * source household address is edited or deleted. Any field the source data
 * didn't have is `null`, never fabricated.
 */
export interface AddressSnapshotDto {
  recipient: string | null;
  phone: string | null;
  addressLine: string | null;
  city: string | null;
  region: string | null;
  countryCode: string | null;
  instructions: string | null;
}

export interface ShippingQuoteDto {
  id: string;
  checkoutId: string;
  sellerOrganizationId: string;
  provider: ShippingProvider;
  serviceLevel: string;
  priceIrr: number;
  estimatedPickupMinutes: number | null;
  estimatedDeliveryMinutes: number | null;
  status: ShippingQuoteStatus;
  expiresAt: string;
  createdAt: string;
}

/** One seller's shipping-option set for a Checkout (spec section 28: "shipping options per seller"). At most one quote in `quotes` has `status: SELECTED`. */
export interface SellerShippingOptionsDto {
  sellerOrganization: SellerOrganizationSummaryDto;
  quotes: ShippingQuoteDto[];
}

export interface FulfillmentDto {
  id: string;
  orderId: string;
  sellerOrganizationId: string;
  status: FulfillmentStatus;
  pickupAddress: AddressSnapshotDto;
  deliveryAddress: AddressSnapshotDto;
  readyAt: string | null;
  pickupRequestedAt: string | null;
  pickupAssignedAt: string | null;
  pickedUpAt: string | null;
  outForDeliveryAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  canceledAt: string | null;
  failureCode: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Customer-facing Shipment view — `providerShipmentId`/raw payload are deliberately absent (spec section 31: "never expose raw provider JSON/credentials"). */
export interface ShipmentDto {
  id: string;
  fulfillmentId: string;
  provider: ShippingProvider;
  trackingCode: string | null;
  status: ShipmentStatus;
  estimatedPickupAt: string | null;
  estimatedDeliveryAt: string | null;
  actualPickupAt: string | null;
  actualDeliveryAt: string | null;
  lastReconciledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One row of the tracking timeline (spec section 32) — `reached: false` milestones are still shown (greyed out in the UI), never hidden, so progress reads as a fixed checklist rather than a live-only feed. */
export interface ShipmentTrackingEventDto {
  milestone: FulfillmentStatus | ShipmentStatus;
  reached: boolean;
  occurredAt: string | null;
}

export interface ShipmentTrackingDto {
  fulfillment: FulfillmentDto | null;
  shipment: ShipmentDto | null;
  timeline: ShipmentTrackingEventDto[];
  lastUpdatedAt: string | null;
}

// ---------------------------------------------------------------------------
// Seller OS + Marketplace Channel Integrations (Handoff 09)
// ---------------------------------------------------------------------------

export enum SellerMembershipRole {
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  OPERATIONS = "OPERATIONS",
  CATALOG_MANAGER = "CATALOG_MANAGER",
  ORDER_MANAGER = "ORDER_MANAGER",
  FINANCE = "FINANCE",
  SUPPORT = "SUPPORT",
  VIEWER = "VIEWER",
}

export enum SellerMembershipStatus {
  PENDING = "PENDING",
  ACTIVE = "ACTIVE",
  DEACTIVATED = "DEACTIVATED",
}

export enum InventoryMovementType {
  MANUAL_ADJUSTMENT = "MANUAL_ADJUSTMENT",
  ORDER_RESERVATION = "ORDER_RESERVATION",
  ORDER_RELEASE = "ORDER_RELEASE",
  ORDER_COMMIT = "ORDER_COMMIT",
  MARKETPLACE_ORDER = "MARKETPLACE_ORDER",
  MARKETPLACE_CANCELLATION = "MARKETPLACE_CANCELLATION",
  RETURN = "RETURN",
  RECONCILIATION = "RECONCILIATION",
  IMPORT = "IMPORT",
  SYSTEM_CORRECTION = "SYSTEM_CORRECTION",
}

export enum MarketplaceProvider {
  DEV = "DEV",
  TOROB = "TOROB",
  DIGIKALA = "DIGIKALA",
}

export enum MarketplaceChannelAccountStatus {
  DISCONNECTED = "DISCONNECTED",
  PENDING = "PENDING",
  CONNECTED = "CONNECTED",
  DEGRADED = "DEGRADED",
  ERROR = "ERROR",
  SUSPENDED = "SUSPENDED",
}

export enum MarketplaceListingStatus {
  DRAFT = "DRAFT",
  PENDING = "PENDING",
  ACTIVE = "ACTIVE",
  PAUSED = "PAUSED",
  REJECTED = "REJECTED",
  ERROR = "ERROR",
  ARCHIVED = "ARCHIVED",
}

export enum MarketplaceListingSyncStatus {
  NEVER_SYNCED = "NEVER_SYNCED",
  QUEUED = "QUEUED",
  SYNCING = "SYNCING",
  SYNCED = "SYNCED",
  DEGRADED = "DEGRADED",
  FAILED = "FAILED",
}

export enum MarketplaceOrderStatus {
  RECEIVED = "RECEIVED",
  CONFIRMED = "CONFIRMED",
  PROCESSING = "PROCESSING",
  READY_TO_FULFILL = "READY_TO_FULFILL",
  SHIPPED = "SHIPPED",
  DELIVERED = "DELIVERED",
  CANCELLED = "CANCELLED",
  RETURNED = "RETURNED",
  FAILED = "FAILED",
  UNKNOWN = "UNKNOWN",
}

export enum DeliveryResponsibility {
  PETLIFE = "PETLIFE",
  MARKETPLACE = "MARKETPLACE",
  SELLER = "SELLER",
  EXTERNAL = "EXTERNAL",
}

export enum PaymentSourceType {
  PETLIFE_PAYMENT = "PETLIFE_PAYMENT",
  MARKETPLACE_COLLECTED = "MARKETPLACE_COLLECTED",
  CASH_ON_DELIVERY = "CASH_ON_DELIVERY",
  UNKNOWN = "UNKNOWN",
}

export enum MarketplaceSyncOperation {
  LISTING_PUBLISH = "LISTING_PUBLISH",
  LISTING_UPDATE = "LISTING_UPDATE",
  LISTING_DEACTIVATE = "LISTING_DEACTIVATE",
  PRICE_SYNC = "PRICE_SYNC",
  INVENTORY_SYNC = "INVENTORY_SYNC",
  ORDER_FETCH = "ORDER_FETCH",
  ORDER_ACK = "ORDER_ACK",
  ORDER_CANCEL = "ORDER_CANCEL",
  RECONCILE = "RECONCILE",
}

export enum MarketplaceSyncAttemptStatus {
  PENDING = "PENDING",
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
}

export interface SellerOrganizationDetailDto {
  id: string;
  name: string;
  slug: string | null;
  verificationStatus: SellerVerificationStatus;
  status: SellerStatus;
  countryCode: string;
  city: string | null;
  logoUrl: string | null;
  description: string | null;
  supportContactEmail: string | null;
  supportContactPhone: string | null;
  defaultCurrency: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

/** Mirrors ProviderMembershipSummaryDto (Handoff 05) — one row per organization a multi-membership user belongs to. */
export interface SellerMembershipSummaryDto {
  sellerMembershipId: string;
  sellerOrganizationId: string;
  organizationName: string;
  verificationStatus: SellerVerificationStatus;
  sellerStatus: SellerStatus;
  role: SellerMembershipRole;
}

/** Mirrors ProviderContextDto — never throws; lets the Seller Shell render an organization picker when nothing is resolvable yet. */
export interface SellerContextDto {
  active: SellerMembershipSummaryDto | null;
  memberships: SellerMembershipSummaryDto[];
}

export interface SellerTeamMemberDto {
  sellerMembershipId: string;
  userId: string;
  displayName: string;
  role: SellerMembershipRole;
  status: SellerMembershipStatus;
  invitedAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export interface InventoryItemDto {
  id: string;
  sellerOfferId: string;
  onHand: number;
  reserved: number;
  /** onHand - reserved, computed server-side, never a stored column (same rule as InventoryItem in Handoff 06). */
  available: number;
  updatedAt: string;
}

export interface InventoryMovementDto {
  id: string;
  inventoryItemId: string;
  type: InventoryMovementType;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  source: string;
  sourceReference: string | null;
  reason: string | null;
  actorUserId: string | null;
  actorDisplayName: string | null;
  createdAt: string;
}

/** Seller-OS view of one SellerOffer — richer than the consumer-facing SellerOfferDto (includes inventory + marketplace sync summary the shopper never needs to see). */
export interface SellerOsOfferDto {
  id: string;
  productVariantId: string;
  productTitle: string;
  variantTitle: string | null;
  sku: string;
  sellerSku: string | null;
  priceAmount: number;
  compareAtAmount: number | null;
  currency: string;
  status: SellerOfferStatus;
  inventory: InventoryItemDto | null;
  marketplaceListingCount: number;
  marketplaceSyncErrorCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceProviderCapabilitiesDto {
  supportsListingPublish: boolean;
  supportsInventoryPush: boolean;
  supportsPricePush: boolean;
  supportsOrderPull: boolean;
  supportsWebhooks: boolean;
  supportsOrderCancellation: boolean;
  supportsListingPause: boolean;
  supportsReconciliation: boolean;
  supportsVariantMapping: boolean;
}

export interface MarketplaceChannelAccountDto {
  id: string;
  sellerOrganizationId: string;
  provider: MarketplaceProvider;
  status: MarketplaceChannelAccountStatus;
  externalSellerId: string | null;
  displayName: string | null;
  syncEnabled: boolean;
  inventorySyncEnabled: boolean;
  priceSyncEnabled: boolean;
  orderSyncEnabled: boolean;
  lastSuccessfulSyncAt: string | null;
  lastAttemptedSyncAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  capabilities: MarketplaceProviderCapabilitiesDto;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceListingDto {
  id: string;
  marketplaceChannelAccountId: string;
  provider: MarketplaceProvider;
  sellerOfferId: string;
  externalListingId: string | null;
  externalProductId: string | null;
  externalVariantId: string | null;
  status: MarketplaceListingStatus;
  syncStatus: MarketplaceListingSyncStatus;
  publishedPriceIrr: number | null;
  publishedInventory: number | null;
  /** The offer's current canonical availableQuantity, shown alongside publishedInventory so a mismatch is visible without a separate reconciliation call. */
  canonicalAvailableQuantity: number | null;
  lastSyncedAt: string | null;
  lastProviderObservedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceOrderItemDto {
  id: string;
  marketplaceListingId: string | null;
  sellerOfferId: string;
  quantity: number;
  unitPriceAmount: number;
  totalPriceAmount: number;
}

export interface MarketplaceOrderDto {
  id: string;
  provider: MarketplaceProvider;
  marketplaceChannelAccountId: string;
  sellerOrganizationId: string;
  externalOrderId: string;
  status: MarketplaceOrderStatus;
  currency: string;
  totalAmount: number;
  deliveryResponsibility: DeliveryResponsibility;
  paymentSource: PaymentSourceType;
  placedAt: string;
  providerUpdatedAt: string | null;
  mappedOrderId: string | null;
  items: MarketplaceOrderItemDto[];
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceSyncAttemptDto {
  id: string;
  operation: MarketplaceSyncOperation;
  status: MarketplaceSyncAttemptStatus;
  attemptNumber: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

/** `discrepancyType: null` means the last check found no mismatch — canonical PET LIFE OS data is never overwritten either way (spec section 35-36). */
export interface MarketplaceReconciliationResultDto {
  discrepancyType: "INVENTORY_MISMATCH" | "PRICE_MISMATCH" | "LISTING_STATUS_MISMATCH" | "ORDER_STATUS_MISMATCH" | "UNKNOWN_PROVIDER_REFERENCE" | null;
  canonicalValue: string | number | null;
  providerObservedValue: string | number | null;
  message: string;
  checkedAt: string;
}

/** A unified seller-facing order row spanning both PET LIFE OS checkout Orders and marketplace-origin Orders (spec section 37) — `source` is DEV/TOROB/DIGIKALA only for a marketplace order, null for an ordinary checkout Order. */
export interface SellerOrderSummaryDto {
  orderId: string;
  source: MarketplaceProvider | null;
  externalOrderId: string | null;
  status: OrderStatus;
  paymentSource: PaymentSourceType;
  fulfillmentStatus: FulfillmentStatus | null;
  itemCount: number;
  totalAmount: number;
  currency: string;
  createdAt: string;
}

export interface SellerDashboardDto {
  ordersRequiringActionCount: number;
  lowStockOfferCount: number;
  activeOfferCount: number;
  channelSyncErrorCount: number;
  fulfillmentExceptionCount: number;
  ordersToday: number;
  unitsSoldToday: number;
  gmvTodayAmount: number;
  recentOrders: SellerOrderSummaryDto[];
}

// ---------------------------------------------------------------------------
// Messaging, Notifications & Preferences (Handoff 10)
// ---------------------------------------------------------------------------

export enum NotificationChannel {
  IN_APP = "IN_APP",
  SMS = "SMS",
  EMAIL = "EMAIL",
  PUSH = "PUSH",
}

export enum NotificationCategory {
  SECURITY = "SECURITY",
  HEALTH = "HEALTH",
  BOOKING = "BOOKING",
  SERVICE = "SERVICE",
  PAYMENT = "PAYMENT",
  COMMERCE = "COMMERCE",
  DELIVERY = "DELIVERY",
  SELLER = "SELLER",
  MARKETPLACE = "MARKETPLACE",
  HOUSEHOLD = "HOUSEHOLD",
  PET_ACCESS = "PET_ACCESS",
  SYSTEM = "SYSTEM",
  MARKETING = "MARKETING",
  SUPPORT = "SUPPORT",
}

export enum NotificationPriority {
  LOW = "LOW",
  NORMAL = "NORMAL",
  HIGH = "HIGH",
  URGENT = "URGENT",
}

export enum NotificationDeliveryStatus {
  PENDING = "PENDING",
  QUEUED = "QUEUED",
  SENDING = "SENDING",
  SENT = "SENT",
  DELIVERED = "DELIVERED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
  SKIPPED = "SKIPPED",
}

export enum NotificationFailureKind {
  TRANSIENT = "TRANSIENT",
  PERMANENT = "PERMANENT",
}

export enum MessagingProvider {
  DEV = "DEV",
  FARAZ = "FARAZ",
}

export interface NotificationDeliveryDto {
  id: string;
  channel: NotificationChannel;
  provider: MessagingProvider | null;
  status: NotificationDeliveryStatus;
  destinationMasked: string | null;
  attemptCount: number;
  failureKind: NotificationFailureKind | null;
  failureCode: string | null;
  failureMessage: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
}

/** A single in-app-visible notification, always addressed to exactly one recipient user (spec: no bare broadcast row — fan-out happens at creation time, one row per recipient). */
export interface NotificationDto {
  id: string;
  type: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body: string;
  locale: Locale;
  deepLink: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  readAt: string | null;
  dismissedAt: string | null;
  deliveries: NotificationDeliveryDto[];
}

export interface UnreadCountDto {
  unreadCount: number;
}

/** One row of the category x channel opt-out grid — absence of a row for a (category, channel) pair means "enabled", so `enabled` here always reflects the resolved value (default true), never a raw nullable override. */
export interface NotificationPreferenceDto {
  category: NotificationCategory;
  channel: NotificationChannel;
  enabled: boolean;
}

export interface NotificationQuietHoursDto {
  enabled: boolean;
  startTime: string;
  endTime: string;
  timezone: string;
}

export interface NotificationPreferencesDto {
  preferences: NotificationPreferenceDto[];
  quietHours: NotificationQuietHoursDto;
}

export interface UpdateNotificationPreferencesDto {
  preferences?: Array<{ category: NotificationCategory; channel: NotificationChannel; enabled: boolean }>;
  quietHours?: { enabled: boolean; startTime: string; endTime: string; timezone: string };
}

// ---------------------------------------------------------------------------
// Admin CRM + Support + Disputes + Trust Operations (Handoff 11)
// ---------------------------------------------------------------------------

export enum AdminRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  ADMIN = "ADMIN",
  SUPPORT = "SUPPORT",
  TRUST_SAFETY = "TRUST_SAFETY",
  FINANCE = "FINANCE",
  OPERATIONS = "OPERATIONS",
  CONTENT = "CONTENT",
  VERIFICATION = "VERIFICATION",
  READ_ONLY = "READ_ONLY",
}

export enum AdminMembershipStatus {
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
}

export enum AdminPriority {
  LOW = "LOW",
  NORMAL = "NORMAL",
  HIGH = "HIGH",
  URGENT = "URGENT",
}

export enum SupportCaseStatus {
  OPEN = "OPEN",
  IN_PROGRESS = "IN_PROGRESS",
  WAITING_ON_USER = "WAITING_ON_USER",
  WAITING_ON_INTERNAL = "WAITING_ON_INTERNAL",
  RESOLVED = "RESOLVED",
  CLOSED = "CLOSED",
}

export enum SupportCaseCategory {
  ACCOUNT = "ACCOUNT",
  PET = "PET",
  HEALTH = "HEALTH",
  BOOKING = "BOOKING",
  SERVICE = "SERVICE",
  PAYMENT = "PAYMENT",
  REFUND = "REFUND",
  ORDER = "ORDER",
  DELIVERY = "DELIVERY",
  SELLER = "SELLER",
  PROVIDER = "PROVIDER",
  MARKETPLACE = "MARKETPLACE",
  TRUST_SAFETY = "TRUST_SAFETY",
  OTHER = "OTHER",
}

export enum SupportMessageAuthorType {
  USER = "USER",
  ADMIN = "ADMIN",
  SYSTEM = "SYSTEM",
}

export enum SupportMessageVisibility {
  PUBLIC = "PUBLIC",
  INTERNAL = "INTERNAL",
}

export enum InternalNoteEntityType {
  USER = "USER",
  HOUSEHOLD = "HOUSEHOLD",
  PET = "PET",
  SUPPORT_CASE = "SUPPORT_CASE",
  DISPUTE = "DISPUTE",
  TRUST_CASE = "TRUST_CASE",
}

export enum AdminTaskStatus {
  OPEN = "OPEN",
  IN_PROGRESS = "IN_PROGRESS",
  DONE = "DONE",
  CANCELLED = "CANCELLED",
}

export enum DisputeSubjectType {
  BOOKING = "BOOKING",
  ORDER = "ORDER",
  PAYMENT = "PAYMENT",
  REFUND = "REFUND",
  SHIPMENT = "SHIPMENT",
  PROVIDER = "PROVIDER",
  SELLER = "SELLER",
}

/** Domain outcome (who the dispute was decided in favor of) is deliberately separate from payment/refund state — see the Dispute model's own doc comment in schema.prisma. */
export enum DisputeStatus {
  OPEN = "OPEN",
  UNDER_REVIEW = "UNDER_REVIEW",
  AWAITING_EVIDENCE = "AWAITING_EVIDENCE",
  RESOLVED_CUSTOMER = "RESOLVED_CUSTOMER",
  RESOLVED_PROVIDER = "RESOLVED_PROVIDER",
  RESOLVED_SELLER = "RESOLVED_SELLER",
  PARTIAL_RESOLUTION = "PARTIAL_RESOLUTION",
  REJECTED = "REJECTED",
  CLOSED = "CLOSED",
}

export enum DisputeEvidenceActorType {
  USER = "USER",
  ADMIN = "ADMIN",
}

export enum TrustSubjectType {
  USER = "USER",
  HOUSEHOLD = "HOUSEHOLD",
  PROVIDER = "PROVIDER",
  SELLER = "SELLER",
  LISTING = "LISTING",
  REVIEW = "REVIEW",
  COMMUNITY_CONTENT = "COMMUNITY_CONTENT",
  PET_INCIDENT = "PET_INCIDENT",
}

export enum TrustCaseSeverity {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export enum TrustCaseStatus {
  OPEN = "OPEN",
  UNDER_REVIEW = "UNDER_REVIEW",
  RESOLVED = "RESOLVED",
  CLOSED = "CLOSED",
}

export enum TrustActionType {
  WARNING = "WARNING",
  RESTRICT = "RESTRICT",
  SUSPEND = "SUSPEND",
  REMOVE_CONTENT = "REMOVE_CONTENT",
  REQUIRE_REVERIFICATION = "REQUIRE_REVERIFICATION",
  RESTORE = "RESTORE",
  NO_ACTION = "NO_ACTION",
}

export enum AppealStatus {
  SUBMITTED = "SUBMITTED",
  UNDER_REVIEW = "UNDER_REVIEW",
  UPHELD = "UPHELD",
  OVERTURNED = "OVERTURNED",
  PARTIALLY_OVERTURNED = "PARTIALLY_OVERTURNED",
}

/** Below the configured IRR threshold a single FINANCE-permission admin may go straight to EXECUTED; at/above it, a *different* admin must APPROVE first. */
export enum AdminRefundApprovalStatus {
  REQUESTED = "REQUESTED",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  EXECUTED = "EXECUTED",
}

/** A minimal actor summary — never the full AdminUserDto — for embedding on cards/lists (assignee, author, requester) without re-fetching the whole admin roster. */
export interface AdminActorSummaryDto {
  id: string;
  displayName: string;
  role: AdminRole;
}

export interface AdminUserDto {
  id: string;
  userId: string;
  displayName: string;
  emailMasked: string | null;
  role: AdminRole;
  status: AdminMembershipStatus;
  createdAt: string;
  lastActiveAt: string | null;
}

export interface SupportMessageDto {
  id: string;
  caseId: string;
  authorType: SupportMessageAuthorType;
  author: AdminActorSummaryDto | { id: string; displayName: string } | null;
  body: string;
  visibility: SupportMessageVisibility;
  createdAt: string;
}

export interface InternalNoteDto {
  id: string;
  entityType: InternalNoteEntityType;
  entityId: string;
  author: AdminActorSummaryDto;
  body: string;
  createdAt: string;
  updatedAt: string | null;
}

/** List-row shape — omits messages/notes, which only the detail endpoint returns. */
export interface SupportCaseSummaryDto {
  id: string;
  caseNumber: string;
  requesterUserId: string;
  requesterDisplayName: string;
  householdId: string | null;
  petId: string | null;
  subject: string;
  category: SupportCaseCategory;
  priority: AdminPriority;
  status: SupportCaseStatus;
  assignedAdmin: AdminActorSummaryDto | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
}

export interface SupportCaseDetailDto extends SupportCaseSummaryDto {
  description: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  createdByAdmin: AdminActorSummaryDto | null;
  messages: SupportMessageDto[];
  internalNotes: InternalNoteDto[];
}

/**
 * Admin-only additions surfaced on the ticket detail context panel — kept
 * separate from SupportCaseDetailDto so the consumer-facing DTOs below can
 * never accidentally inherit them.
 */
export interface SupportCaseContextDto {
  household: { id: string; name: string } | null;
  pet: { id: string; name: string } | null;
  relatedEntity: { type: string; id: string; summary: string } | null;
  previousCases: SupportCaseSummaryDto[];
  firstResponseAt: string | null;
  firstResponseTimeMinutes: number | null;
  resolutionTimeMinutes: number | null;
  /** Handoff 16 — coarse subscription/billing-state summary for the case's household, null when the case has no household. Never a payment secret (see SupportSubscriptionSummaryDto's own doc comment). */
  subscription: SupportSubscriptionSummaryDto | null;
  /** Handoff 17 — coarse clinical-record summary for the case's pet, null when the case has no linked pet. Never the full clinical record (see SupportHealthSummaryDto's own doc comment). */
  health: SupportHealthSummaryDto | null;
  /** Handoff 18 — coarse Lost Pet summary for the case's pet, null when the case has no linked pet. Never sighting contact detail or private notes (see SupportLostPetSummaryDto's own doc comment). */
  lostPet: SupportLostPetSummaryDto | null;
}

/**
 * The simplified status a consumer sees — collapses the two internal
 * "waiting" states and hides WAITING_ON_INTERNAL entirely (spec: "hide
 * internal complexity"). Never derived on the frontend: the API computes it
 * from SupportCaseStatus so the mapping only has to be reasoned about once.
 */
export enum UserFacingSupportCaseStatus {
  SUBMITTED = "SUBMITTED",
  UNDER_REVIEW = "UNDER_REVIEW",
  WAITING = "WAITING",
  RESOLVED = "RESOLVED",
  CLOSED = "CLOSED",
}

/**
 * The consumer-facing ticket list/detail shape. Deliberately does NOT
 * extend SupportCaseSummaryDto/SupportCaseDetailDto: it omits priority and
 * assignedAdmin (internal operational fields, spec: don't expose "why is my
 * ticket LOW") and, on the detail variant, has no internalNotes field at
 * all — not filtered out, structurally absent — satisfying "INTERNAL
 * messages / notes must NEVER be visible through consumer APIs."
 */
export interface SupportCaseUserSummaryDto {
  id: string;
  caseNumber: string;
  subject: string;
  category: SupportCaseCategory;
  status: UserFacingSupportCaseStatus;
  householdId: string | null;
  petId: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
}

export interface SupportCaseUserDetailDto extends SupportCaseUserSummaryDto {
  description: string;
  messages: SupportMessageDto[];
}

export interface AdminTaskDto {
  id: string;
  title: string;
  description: string | null;
  assigneeAdmin: AdminActorSummaryDto | null;
  dueAt: string | null;
  status: AdminTaskStatus;
  priority: AdminPriority;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  createdByAdmin: AdminActorSummaryDto;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DisputeEvidenceDto {
  id: string;
  disputeId: string;
  actorType: DisputeEvidenceActorType;
  actor: AdminActorSummaryDto | { id: string; displayName: string } | null;
  statement: string;
  attachmentRef: string | null;
  createdAt: string;
}

export interface DisputeDto {
  id: string;
  subjectType: DisputeSubjectType;
  subjectId: string;
  raisedByUserId: string | null;
  supportCaseId: string | null;
  claim: string;
  status: DisputeStatus;
  assignedAdmin: AdminActorSummaryDto | null;
  resolutionSummary: string | null;
  evidence: DisputeEvidenceDto[];
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
}

export interface TrustActionDto {
  id: string;
  trustCaseId: string;
  actionType: TrustActionType;
  reason: string;
  performedByAdmin: AdminActorSummaryDto;
  createdAt: string;
  appeal: AppealDto | null;
}

export interface AppealDto {
  id: string;
  trustActionId: string;
  appellantUserId: string;
  reason: string;
  status: AppealStatus;
  resolution: string | null;
  reviewerAdmin: AdminActorSummaryDto | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface TrustCaseDto {
  id: string;
  subjectType: TrustSubjectType;
  subjectId: string;
  reason: string;
  severity: TrustCaseSeverity;
  status: TrustCaseStatus;
  assignedAdmin: AdminActorSummaryDto | null;
  openedByAdmin: AdminActorSummaryDto;
  actions: TrustActionDto[];
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

/** Wraps (never replaces) RefundsService.request() — see the AdminRefundApproval model's own doc comment. `refundId` is set only once EXECUTED actually calls the refund flow. */
export interface AdminRefundApprovalDto {
  id: string;
  orderId: string;
  amount: number;
  reason: string;
  status: AdminRefundApprovalStatus;
  requestedByAdmin: AdminActorSummaryDto;
  approvedByAdmin: AdminActorSummaryDto | null;
  refundId: string | null;
  createdAt: string;
  updatedAt: string;
  executedAt: string | null;
}

export interface AdminAuditLogDto {
  id: string;
  adminUser: AdminActorSummaryDto;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  beforeSummary: Record<string, unknown> | null;
  afterSummary: Record<string, unknown> | null;
  requestId: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Customer/Household/Pet 360 + operational search (Handoff 11)
// ---------------------------------------------------------------------------

/** A list-row/search-result shape — masked contact info by default (spec: "PII masking by default, with audited reveal"). */
export interface AdminCustomerListItemDto {
  id: string;
  displayName: string;
  emailMasked: string | null;
  phoneMasked: string | null;
  createdAt: string;
}

export interface AdminPetSummaryDto {
  id: string;
  name: string;
  species: PetSpecies;
  lifecycleStatus: PetLifecycleStatus;
}

export interface AdminHouseholdSummaryDto {
  id: string;
  name: string | null;
  city: string | null;
  memberCount: number;
  pets: AdminPetSummaryDto[];
}

export interface AdminOrderSummaryDto {
  id: string;
  status: OrderStatus;
  totalAmount: number;
  currency: string;
  createdAt: string;
}

export interface AdminBookingSummaryDto {
  id: string;
  category: string;
  bookingStatus: string;
  startAt: string;
  petId: string;
}

/** One entry in the merged, application-code-composed activity feed (mirrors Handoff 09's own "unified view via in-app merge" precedent — never a query against the internal DomainEvent outbox table, which lacks direct userId/householdId columns). */
export interface ActivityTimelineEntryDto {
  type: "order" | "booking" | "support_case" | "dispute" | "notification";
  id: string;
  summary: string;
  occurredAt: string;
}

/** The single navigable "understand this household" view (spec: "Customer -> Household -> Pet -> Activity -> Transactions -> Support issue -> Action -> Resolution -> Audit trail"). Contact fields stay masked until a `customer.pii.reveal`-permitted admin calls the reveal endpoint. */
export interface Customer360Dto {
  user: AdminCustomerListItemDto;
  households: AdminHouseholdSummaryDto[];
  recentOrders: AdminOrderSummaryDto[];
  recentBookings: AdminBookingSummaryDto[];
  supportCases: SupportCaseSummaryDto[];
  disputes: DisputeDto[];
  internalNotes: InternalNoteDto[];
  communications: NotificationDto[];
  activityTimeline: ActivityTimelineEntryDto[];
}

export interface AdminPiiRevealDto {
  field: "email" | "phone";
  value: string;
}

export interface AdminSearchResultDto {
  customers: AdminCustomerListItemDto[];
  orders: AdminOrderSummaryDto[];
  supportCases: SupportCaseSummaryDto[];
}

// ---------------------------------------------------------------------------
// Minimal financial visibility (Handoff 11) — read-only inspection.
// Refund *initiation* never happens here; see AdminRefundApprovalDto above.
// ---------------------------------------------------------------------------

export interface AdminPaymentAttemptDto {
  id: string;
  provider: PaymentProvider;
  status: PaymentAttemptStatus;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface AdminTransactionDto {
  id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  status: TransactionStatus;
  createdAt: string;
}

export interface AdminRefundDto {
  id: string;
  amount: number;
  currency: string;
  status: RefundStatus;
  reason: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface AdminPaymentIntentDto {
  id: string;
  amount: number;
  currency: string;
  status: PaymentIntentStatus;
  provider: PaymentProvider;
  createdAt: string;
  attempts: AdminPaymentAttemptDto[];
  transactions: AdminTransactionDto[];
  refunds: AdminRefundDto[];
}

export interface AdminLedgerEntryDto {
  id: string;
  direction: LedgerEntryDirection;
  amount: number;
  accountCode: LedgerAccountCode;
  accountName: string;
  createdAt: string;
}

/** Read-only (spec: "refund initiation ONLY through existing H07 RefundsService, never direct ledger mutation") — this view never writes anything. */
export interface AdminOrderFinancialsDto {
  orderId: string;
  paymentIntents: AdminPaymentIntentDto[];
  ledgerEntries: AdminLedgerEntryDto[];
}

/** Minimal admin-facing org summaries, used to locate a Provider/Seller for verification overrides or as a TrustCase subject — never the seller/provider's own operational DTOs, which carry fields (context, membership) an internal admin view has no use for. */
export interface AdminProviderOrgSummaryDto {
  id: string;
  name: string;
  type: string;
  verificationStatus: ProviderVerificationStatus;
  createdAt: string;
}

export interface AdminSellerOrgSummaryDto {
  id: string;
  name: string;
  status: SellerStatus;
  verificationStatus: SellerVerificationStatus;
  createdAt: string;
}

export interface AdminDashboardSummaryDto {
  openSupportCases: number;
  openDisputes: number;
  openTrustCases: number;
  pendingRefundApprovals: number;
  openTasks: number;
}

/** The admin-domain mirror of AdminPermission (apps/api's own admin-permissions.ts) — kept as a plain string union here since the frontend only ever compares/display-filters against it, never re-derives access decisions (the backend is always the source of truth; hiding a nav item is a convenience, never a security boundary). */
export type AdminPermissionName =
  | "customer.view"
  | "customer.pii.reveal"
  | "support.view"
  | "support.manage"
  | "dispute.view"
  | "dispute.manage"
  | "trust.view"
  | "trust.manage"
  | "verification.manage"
  | "finance.view"
  | "finance.refund.request"
  | "finance.refund.approve"
  | "finance.refund.execute"
  | "task.manage"
  | "audit.view"
  | "admin.manage"
  | "sellerFinance.view"
  | "settlement.calculate"
  | "settlement.approve"
  | "settlement.pay"
  | "settlement.adjust"
  | "content.view"
  | "content.create"
  | "content.edit"
  | "content.publish"
  | "content.archive"
  | "content.media.manage"
  | "subscription.view"
  | "subscription.manage"
  | "subscription.plan.manage"
  | "subscription.entitlement.override"
  | "animalSupport.view"
  | "animalSupport.manage"
  | "animalSupport.payout";

/** Never throws (mirrors SellerContextDto's own "resolve once, always succeeds" shape) — `isAdmin: false` is a normal, expected resolution for the overwhelming majority of authenticated sessions, not an error state. */
export interface AdminSessionContextDto {
  isAdmin: boolean;
  adminUserId: string | null;
  displayName: string | null;
  role: AdminRole | null;
  permissions: AdminPermissionName[];
}

// ---------------------------------------------------------------------------
// Marketplace & Seller Financial Settlement (Handoff 14)
// ---------------------------------------------------------------------------

export enum OrderOrigin {
  PET_LIFE = "PET_LIFE",
  DEV_MARKETPLACE = "DEV_MARKETPLACE",
  TOROB = "TOROB",
  DIGIKALA = "DIGIKALA",
}

export enum FinancialConfidence {
  KNOWN = "KNOWN",
  ESTIMATED = "ESTIMATED",
  UNKNOWN = "UNKNOWN",
}

export enum SellerFinancialAccountStatus {
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
}

export enum SellerSettlementScheduleType {
  WEEKLY = "WEEKLY",
  BIWEEKLY = "BIWEEKLY",
  MONTHLY = "MONTHLY",
  MANUAL = "MANUAL",
}

export enum SellerSettlementStatus {
  CALCULATED = "CALCULATED",
  APPROVED = "APPROVED",
  PAID = "PAID",
  FAILED = "FAILED",
  RECONCILIATION_REQUIRED = "RECONCILIATION_REQUIRED",
  CANCELLED = "CANCELLED",
}

export enum SellerAdjustmentType {
  CREDIT = "CREDIT",
  DEBIT = "DEBIT",
}

export enum SellerAdjustmentReasonCode {
  SHIPPING_COMPENSATION = "SHIPPING_COMPENSATION",
  MANUAL_CREDIT = "MANUAL_CREDIT",
  MANUAL_DEBIT = "MANUAL_DEBIT",
  MARKETPLACE_PENALTY = "MARKETPLACE_PENALTY",
  CORRECTION = "CORRECTION",
}

export enum MarketplaceSettlementImportSource {
  MANUAL = "MANUAL",
  CSV_IMPORT = "CSV_IMPORT",
  API = "API",
}

export enum MarketplaceReconciliationStatus {
  MATCHED = "MATCHED",
  MISMATCH = "MISMATCH",
  MISSING_EXTERNAL = "MISSING_EXTERNAL",
  MISSING_INTERNAL = "MISSING_INTERNAL",
  DUPLICATE = "DUPLICATE",
  REVIEW_REQUIRED = "REVIEW_REQUIRED",
}

export interface SellerFinancialAccountDto {
  id: string;
  sellerOrganizationId: string;
  currency: string;
  status: SellerFinancialAccountStatus;
  settlementSchedule: SellerSettlementScheduleType;
  payoutMethodType: string;
  payoutReferenceMasked: string | null;
  minimumPayoutIrr: number;
  createdAt: string;
  updatedAt: string;
}

/** `pendingIrr`/`availableIrr` are the same figure this phase — see README "Seller balance" for why a RESERVED/AVAILABLE split isn't modeled yet (no async payout provider to reserve funds against). Every figure here is derived from ledger entries on request, never a stored mutable number. */
export interface SellerBalanceSummaryDto {
  pendingIrr: number;
  availableIrr: number;
  reservedIrr: number;
  paidIrr: number;
}

export interface SellerFinanceSummaryDto {
  account: SellerFinancialAccountDto;
  balance: SellerBalanceSummaryDto;
  nextSettlementEligibleIrr: number;
  lastSettlement: SellerSettlementDto | null;
}

export interface OrderFinancialBreakdownDto {
  id: string;
  orderId: string;
  sellerOrganizationId: string;
  origin: OrderOrigin;
  grossMerchandiseIrr: number;
  shippingIrr: number;
  discountIrr: number;
  shippingResponsibility: DeliveryResponsibility;
  commissionBasisPoints: number;
  platformCommissionIrr: number;
  channelFeeIrr: number;
  channelFeeConfidence: FinancialConfidence;
  sellerGrossIrr: number;
  sellerNetIrr: number;
  createdAt: string;
}

/** One row of the seller-facing transaction history (spec: "Order, Gross, Commission, Fees, Refund, Net, Settlement status, date, channel"). `breakdown` is present only for `referenceType === "ORDER_SALE"` — a refund/adjustment row carries just its own net amount and description, never a fabricated breakdown. */
export interface SellerTransactionDto {
  id: string;
  referenceType: string;
  referenceId: string;
  description: string;
  breakdown: OrderFinancialBreakdownDto | null;
  netAmountIrr: number;
  settlementId: string | null;
  settlementStatus: SellerSettlementStatus | null;
  createdAt: string;
}

export interface CommissionRuleDto {
  id: string;
  sellerOrganizationId: string | null;
  channel: OrderOrigin | null;
  basisPoints: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
}

export interface SellerSettlementItemDto {
  id: string;
  sourceType: string;
  sourceId: string;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  description: string;
  createdAt: string;
}

export interface SellerSettlementDto {
  id: string;
  reference: string;
  sellerOrganizationId: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  status: SellerSettlementStatus;
  grossIrr: number;
  commissionIrr: number;
  refundsIrr: number;
  adjustmentsIrr: number;
  netIrr: number;
  initiatedByAdmin: AdminActorSummaryDto;
  approvedByAdmin: AdminActorSummaryDto | null;
  payoutMethodType: string | null;
  createdAt: string;
  approvedAt: string | null;
  paidAt: string | null;
  reconciledAt: string | null;
  cancelledAt: string | null;
}

/** List-row shape is SellerSettlementDto itself — `items` only ever comes back on the detail endpoint (mirrors SupportCaseDetailDto's own summary/detail split). */
export interface SellerSettlementDetailDto extends SellerSettlementDto {
  items: SellerSettlementItemDto[];
}

export interface SellerAdjustmentDto {
  id: string;
  sellerOrganizationId: string;
  type: SellerAdjustmentType;
  reasonCode: SellerAdjustmentReasonCode;
  amountIrr: number;
  reason: string;
  evidenceReference: string | null;
  createdByAdmin: AdminActorSummaryDto;
  createdAt: string;
}

export interface AdminSellerFinanceSummaryDto {
  sellerOrganization: AdminSellerOrgSummaryDto;
  account: SellerFinancialAccountDto | null;
  balance: SellerBalanceSummaryDto;
}

export interface MarketplaceSettlementStatementLineDto {
  id: string;
  externalOrderId: string;
  amount: number;
  feeAmount: number | null;
  feeConfidence: FinancialConfidence;
  description: string | null;
  createdAt: string;
}

export interface MarketplaceSettlementStatementDto {
  id: string;
  provider: MarketplaceProvider;
  marketplaceChannelAccountId: string;
  sellerOrganizationId: string;
  source: MarketplaceSettlementImportSource;
  periodStart: string;
  periodEnd: string;
  currency: string;
  totalAmount: number;
  importedByAdmin: AdminActorSummaryDto;
  createdAt: string;
  lines: MarketplaceSettlementStatementLineDto[];
}

/** Named distinctly from the pre-existing (Handoff 09) MarketplaceReconciliationResultDto above, which is a different, unrelated concept — that one is an inventory/listing-data discrepancy check, this one is a settlement-statement finding. */
export interface MarketplaceSettlementReconciliationResultDto {
  id: string;
  marketplaceSettlementStatementId: string | null;
  marketplaceSettlementStatementLineId: string | null;
  marketplaceOrderId: string | null;
  status: MarketplaceReconciliationStatus;
  expectedAmount: number | null;
  statementAmount: number | null;
  variance: number | null;
  notes: string | null;
  resolvedByAdmin: AdminActorSummaryDto | null;
  resolvedAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// CMS + Blog + Content Management (Handoff 15)
// ---------------------------------------------------------------------------

export enum ArticleLifecycleStatus {
  DRAFT = "DRAFT",
  VISIBLE = "VISIBLE",
  HIDDEN = "HIDDEN",
  ARCHIVED = "ARCHIVED",
}

export enum ContentPlacementKey {
  LANDING_HERO = "LANDING_HERO",
  LANDING_FEATURED_CONTENT = "LANDING_FEATURED_CONTENT",
  HOME_EDUCATION = "HOME_EDUCATION",
  HOME_ANNOUNCEMENT = "HOME_ANNOUNCEMENT",
}

/**
 * Structured rich text ("portable text"), never raw HTML (spec: "prefer
 * structured rich text/portable content over storing arbitrary HTML
 * directly"). A closed block/mark vocabulary makes script injection
 * structurally impossible — the renderer only ever maps a known `type` to a
 * real element, never interprets a string as markup. `RichTextInlineLink`'s
 * `href` is validated server-side (http(s):// or a same-origin relative
 * path only — see admin content DTOs) before every save.
 */
export type RichTextMark = "bold" | "italic" | "code";

export interface RichTextInlineText {
  text: string;
  marks?: RichTextMark[];
}

export interface RichTextInlineLink {
  type: "link";
  href: string;
  text: string;
}

export type RichTextInline = RichTextInlineText | RichTextInlineLink;

export type RichTextBlock =
  | { type: "paragraph"; content: RichTextInline[] }
  | { type: "heading"; level: 2 | 3 | 4; content: RichTextInline[] }
  | { type: "list"; style: "bulleted" | "numbered"; items: RichTextInline[][] }
  | { type: "quote"; content: RichTextInline[] }
  | { type: "callout"; tone: "info" | "warning"; content: RichTextInline[] }
  /** `url` is never stored or accepted on write — the server resolves it from `mediaAssetId` on every read response so the renderer never has to look anything up itself. */
  | { type: "image"; mediaAssetId: string; alt: string; caption?: string; url?: string };

export type RichTextDocument = RichTextBlock[];

export interface MediaAssetDto {
  id: string;
  url: string;
  mimeType: string;
  fileSizeBytes: number;
  widthPx: number | null;
  heightPx: number | null;
  altText: string | null;
  createdByAdmin: AdminActorSummaryDto;
  disabledAt: string | null;
  createdAt: string;
}

export interface ContentAuthorDto {
  id: string;
  name: string;
  bio: string | null;
  avatarMediaAsset: MediaAssetDto | null;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryLocaleDto {
  locale: Locale;
  name: string;
  slug: string;
  description: string | null;
}

export interface CategoryDto {
  id: string;
  locales: CategoryLocaleDto[];
  createdAt: string;
  updatedAt: string;
}

/** The public-facing, single-locale-resolved shape a blog list/article/placement ever returns — never the full multi-locale admin row. */
export interface PublicCategoryDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface TagLocaleDto {
  locale: Locale;
  name: string;
  slug: string;
}

export interface TagDto {
  id: string;
  locales: TagLocaleDto[];
}

export interface PublicTagDto {
  id: string;
  name: string;
  slug: string;
}

/** One row of the admin article list (spec: "locale availability" as a list filter/column) — never the full body of any locale. */
export interface AdminArticleLocaleAvailabilityDto {
  locale: Locale;
  status: ArticleLifecycleStatus;
  title: string;
  slug: string;
  updatedAt: string;
}

export interface AdminArticleListItemDto {
  id: string;
  author: ContentAuthorDto | null;
  category: PublicCategoryDto | null;
  createdByAdmin: AdminActorSummaryDto;
  createdAt: string;
  updatedAt: string;
  locales: AdminArticleLocaleAvailabilityDto[];
}

/** The article aggregate as the admin editor's shell — author/category/cover/tags are shared across locales; editorial content itself is fetched/edited per locale via AdminArticleLocaleDto below (spec: "manage Persian and English independently"). */
export interface AdminArticleDto {
  id: string;
  author: ContentAuthorDto | null;
  category: CategoryDto | null;
  coverMediaAsset: MediaAssetDto | null;
  tags: TagDto[];
  createdByAdmin: AdminActorSummaryDto;
  createdAt: string;
  updatedAt: string;
  locales: AdminArticleLocaleAvailabilityDto[];
}

/** The actual per-locale editorial payload — what the article editor loads/saves for one locale (spec: "independent title, slug, excerpt, body, SEO title, SEO description, locale-specific publication readiness"). */
export interface AdminArticleLocaleDto {
  articleId: string;
  locale: Locale;
  status: ArticleLifecycleStatus;
  title: string;
  slug: string;
  excerpt: string | null;
  body: RichTextDocument;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  lastEditedByAdmin: AdminActorSummaryDto | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentVersionSummaryDto {
  id: string;
  articleId: string;
  locale: Locale;
  versionNumber: number;
  editorAdmin: AdminActorSummaryDto;
  changeNote: string | null;
  createdAt: string;
}

export interface ArticleLocaleSnapshot {
  title: string;
  slug: string;
  excerpt: string | null;
  body: RichTextDocument;
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface ContentVersionDetailDto extends ContentVersionSummaryDto {
  snapshot: ArticleLocaleSnapshot;
}

/** The public blog list row — one locale, one already-resolved category/tag/author view. `canonicalPath` is server-computed (spec: "locale-aware canonical URL") so the frontend never has to reconstruct it. */
export interface PublicArticleSummaryDto {
  id: string;
  locale: Locale;
  slug: string;
  canonicalPath: string;
  title: string;
  excerpt: string | null;
  coverMediaAsset: MediaAssetDto | null;
  author: ContentAuthorDto | null;
  category: PublicCategoryDto | null;
  tags: PublicTagDto[];
  publishedAt: string;
  updatedAt: string;
}

export interface PublicArticleDetailDto extends PublicArticleSummaryDto {
  body: RichTextDocument;
  seoTitle: string | null;
  seoDescription: string | null;
}

/** A minimal, non-leaking reference to an article for use inside a placement block — never the full body. */
export interface PublicArticleReferenceDto {
  id: string;
  locale: Locale;
  slug: string;
  canonicalPath: string;
  title: string;
  excerpt: string | null;
  coverMediaAsset: MediaAssetDto | null;
}

export interface PublicContentBlockDto {
  id: string;
  sortOrder: number;
  heading: string | null;
  body: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  linkedArticle: PublicArticleReferenceDto | null;
  mediaAsset: MediaAssetDto | null;
}

export interface PublicContentPlacementDto {
  key: ContentPlacementKey;
  blocks: PublicContentBlockDto[];
}

export interface AdminContentBlockLocaleDto {
  locale: Locale;
  heading: string | null;
  body: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
}

export interface AdminContentBlockDto {
  id: string;
  sortOrder: number;
  linkedArticleId: string | null;
  mediaAsset: MediaAssetDto | null;
  locales: AdminContentBlockLocaleDto[];
}

export interface AdminContentPlacementDto {
  key: ContentPlacementKey;
  updatedByAdmin: AdminActorSummaryDto | null;
  updatedAt: string;
  blocks: AdminContentBlockDto[];
}

// ---------------------------------------------------------------------------
// Subscription + Membership + Metering (Handoff 16)
// ---------------------------------------------------------------------------

export enum SubscriptionPlanStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  HIDDEN = "HIDDEN",
}

export enum SubscriptionPlanPriceStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
}

export enum SubscriptionBillingInterval {
  MONTHLY = "MONTHLY",
  ANNUAL = "ANNUAL",
}

export enum SubscriptionEntitlementType {
  BOOLEAN = "BOOLEAN",
  LIMIT = "LIMIT",
}

/** See the matching Prisma enum's own doc comment (schema.prisma) for why PAST_DUE/GRACE_PERIOD are distinct steps. */
export enum SubscriptionStatus {
  TRIALING = "TRIALING",
  ACTIVE = "ACTIVE",
  PAST_DUE = "PAST_DUE",
  GRACE_PERIOD = "GRACE_PERIOD",
  CANCEL_AT_PERIOD_END = "CANCEL_AT_PERIOD_END",
  CANCELLED = "CANCELLED",
  EXPIRED = "EXPIRED",
}

export enum SubscriptionPeriodStatus {
  ACTIVE = "ACTIVE",
  ENDED = "ENDED",
}

export enum SubscriptionChangeType {
  TRIAL_STARTED = "TRIAL_STARTED",
  INITIAL_PURCHASE = "INITIAL_PURCHASE",
  UPGRADE = "UPGRADE",
  DOWNGRADE_SCHEDULED = "DOWNGRADE_SCHEDULED",
  DOWNGRADE_APPLIED = "DOWNGRADE_APPLIED",
  CANCEL_SCHEDULED = "CANCEL_SCHEDULED",
  CANCEL_REVERSED = "CANCEL_REVERSED",
  RENEWED = "RENEWED",
  PAST_DUE = "PAST_DUE",
  GRACE_STARTED = "GRACE_STARTED",
  EXPIRED = "EXPIRED",
  ADMIN_CANCELLED = "ADMIN_CANCELLED",
  ENTITLEMENT_OVERRIDE_GRANTED = "ENTITLEMENT_OVERRIDE_GRANTED",
  ENTITLEMENT_OVERRIDE_REVOKED = "ENTITLEMENT_OVERRIDE_REVOKED",
}

export enum SubscriptionBillingReason {
  INITIAL = "INITIAL",
  RENEWAL = "RENEWAL",
  UPGRADE = "UPGRADE",
}

export enum SubscriptionBillingAttemptStatus {
  PENDING = "PENDING",
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
}

export interface SubscriptionPlanEntitlementDto {
  key: string;
  type: SubscriptionEntitlementType;
  boolValue: boolean | null;
  /** `null` on a LIMIT-type row means unlimited — never confused with "0" or "not configured". */
  limitValue: number | null;
}

export interface SubscriptionPlanPriceDto {
  id: string;
  countryCode: string;
  currency: string;
  billingInterval: SubscriptionBillingInterval;
  /** Integer IRR — the sole financial source of truth. The UI renders Toman via the existing `formatCurrency()` helper; never store or trust a Toman value from a client. */
  amount: number;
  status: SubscriptionPlanPriceStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
}

/** A minimal, embeddable reference — used inside periods/attempts/changes so those payloads don't repeat every price/entitlement row. */
export interface SubscriptionPlanRefDto {
  id: string;
  code: string;
  nameFa: string;
  nameEn: string;
}

export interface SubscriptionPlanDto {
  id: string;
  code: string;
  nameFa: string;
  nameEn: string;
  descriptionFa: string | null;
  descriptionEn: string | null;
  status: SubscriptionPlanStatus;
  sortOrder: number;
  isFree: boolean;
  trialDays: number | null;
  countryAvailability: string[];
  entitlements: SubscriptionPlanEntitlementDto[];
  prices: SubscriptionPlanPriceDto[];
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionPeriodDto {
  id: string;
  status: SubscriptionPeriodStatus;
  plan: SubscriptionPlanRefDto;
  startAt: string;
  endAt: string;
  isTrial: boolean;
  amount: number | null;
  currency: string;
}

export interface SubscriptionBillingAttemptDto {
  id: string;
  reason: SubscriptionBillingReason;
  attemptNumber: number;
  status: SubscriptionBillingAttemptStatus;
  amount: number;
  currency: string;
  failureCode: string | null;
  failureReason: string | null;
  paymentIntentId: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface SubscriptionChangeDto {
  id: string;
  type: SubscriptionChangeType;
  fromPlan: SubscriptionPlanRefDto | null;
  toPlan: SubscriptionPlanRefDto | null;
  effectiveAt: string | null;
  note: string | null;
  initiatedByAdmin: AdminActorSummaryDto | null;
  createdAt: string;
}

/** The household's own current subscription — GET /subscriptions/current. */
export interface SubscriptionDto {
  id: string;
  status: SubscriptionStatus;
  plan: SubscriptionPlanRefDto;
  price: SubscriptionPlanPriceDto | null;
  pendingPlan: SubscriptionPlanRefDto | null;
  pendingPrice: SubscriptionPlanPriceDto | null;
  currentPeriod: SubscriptionPeriodDto | null;
  trialEndsAt: string | null;
  gracePeriodEndsAt: string | null;
  cancelRequestedAt: string | null;
  cancelEffectiveAt: string | null;
  expiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedEntitlementDto {
  key: string;
  type: SubscriptionEntitlementType;
  boolValue: boolean | null;
  limitValue: number | null;
  /** True when this value came from an active SubscriptionEntitlementOverride rather than the resolved plan. */
  overridden: boolean;
}

export interface SubscriptionUsageItemDto {
  key: string;
  limit: number | null;
  used: number;
  remaining: number | null;
}

export interface SubscriptionBillingHistoryDto {
  periods: SubscriptionPeriodDto[];
  attempts: SubscriptionBillingAttemptDto[];
}

export interface AdminSubscriptionSummaryDto {
  id: string;
  household: { id: string; name: string | null };
  status: SubscriptionStatus;
  plan: SubscriptionPlanRefDto;
  currentPeriodEndAt: string | null;
  updatedAt: string;
}

export interface AdminSubscriptionDetailDto extends SubscriptionDto {
  household: { id: string; name: string | null };
  changes: SubscriptionChangeDto[];
  billingAttempts: SubscriptionBillingAttemptDto[];
}

export interface SubscriptionEntitlementOverrideDto {
  id: string;
  householdId: string;
  key: string;
  type: SubscriptionEntitlementType;
  boolValue: boolean | null;
  limitValue: number | null;
  reason: string;
  createdByAdmin: AdminActorSummaryDto;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
}

/** The coarse subscription summary the H13 support context panel shows — never a payment secret. */
export interface SupportSubscriptionSummaryDto {
  status: SubscriptionStatus;
  planCode: string;
  planNameEn: string;
  currentPeriodEndAt: string | null;
  recentFailedBillingAttempt: SubscriptionBillingAttemptDto | null;
}

// ---------------------------------------------------------------------------
// Advanced Health / Clinical OS (Handoff 17)
// ---------------------------------------------------------------------------

export enum MedicalDocumentType {
  LAB_REPORT = "LAB_REPORT",
  IMAGING_REPORT = "IMAGING_REPORT",
  PRESCRIPTION = "PRESCRIPTION",
  VACCINATION_CERTIFICATE = "VACCINATION_CERTIFICATE",
  REFERRAL = "REFERRAL",
  DISCHARGE_SUMMARY = "DISCHARGE_SUMMARY",
  CLINICAL_NOTE = "CLINICAL_NOTE",
  DENTAL_RECORD = "DENTAL_RECORD",
  NUTRITION_PLAN = "NUTRITION_PLAN",
  REHAB_PLAN = "REHAB_PLAN",
  OTHER = "OTHER",
}

export enum DocumentVisibility {
  HOUSEHOLD_ONLY = "HOUSEHOLD_ONLY",
  PROVIDER_SHARED = "PROVIDER_SHARED",
}

export enum DocumentVerificationStatus {
  UNVERIFIED = "UNVERIFIED",
  PROVIDER_VERIFIED = "PROVIDER_VERIFIED",
}

export enum CorrectableRecordType {
  CONDITION = "CONDITION",
  ALLERGY = "ALLERGY",
  MEDICATION = "MEDICATION",
  VACCINATION_SUMMARY = "VACCINATION_SUMMARY",
  LAB_RESULT = "LAB_RESULT",
  IMAGING_STUDY = "IMAGING_STUDY",
  MEDICAL_DOCUMENT = "MEDICAL_DOCUMENT",
  CLINICAL_VISIT = "CLINICAL_VISIT",
}

export enum MedicalRecordCorrectionStatus {
  OPEN = "OPEN",
  ACKNOWLEDGED_BY_PROVIDER = "ACKNOWLEDGED_BY_PROVIDER",
  RESOLVED = "RESOLVED",
}

export enum LabResultStatus {
  PENDING = "PENDING",
  FINAL = "FINAL",
  AMENDED = "AMENDED",
  CANCELLED = "CANCELLED",
}

/** Never derived client-side or server-side from value/unit — only ever an explicit provider designation. */
export enum LabResultFlag {
  NORMAL = "NORMAL",
  ABNORMAL = "ABNORMAL",
}

export enum ImagingStudyType {
  XRAY = "XRAY",
  ULTRASOUND = "ULTRASOUND",
  CT = "CT",
  MRI = "MRI",
  OTHER = "OTHER",
}

export enum ReferralStatus {
  CREATED = "CREATED",
  SENT = "SENT",
  ACCEPTED = "ACCEPTED",
  SCHEDULED = "SCHEDULED",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export enum DentalRecordType {
  EXAM = "EXAM",
  CLEANING = "CLEANING",
  PROCEDURE = "PROCEDURE",
  EXTRACTION = "EXTRACTION",
  FINDING = "FINDING",
  FOLLOW_UP = "FOLLOW_UP",
}

export enum RehabPlanStatus {
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED",
  DISCONTINUED = "DISCONTINUED",
}

export enum ObservationCategory {
  SYMPTOM = "SYMPTOM",
  APPETITE = "APPETITE",
  BEHAVIOR = "BEHAVIOR",
  MOBILITY = "MOBILITY",
  STOOL = "STOOL",
  VOMITING = "VOMITING",
  SLEEP = "SLEEP",
  PAIN = "PAIN",
  OTHER = "OTHER",
}

export enum ObservationMediaType {
  PHOTO = "PHOTO",
  VIDEO = "VIDEO",
}

/** Booking = commercial/scheduling state. ClinicalVisit = care-documentation state — deliberately never collapsed together. */
export enum ClinicalVisitStatus {
  DRAFT = "DRAFT",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  AMENDED = "AMENDED",
  VOIDED = "VOIDED",
}

export enum CarePlanItemType {
  MEDICATION = "MEDICATION",
  FOLLOW_UP = "FOLLOW_UP",
  NUTRITION = "NUTRITION",
  REHAB = "REHAB",
  MONITORING = "MONITORING",
  REFERRAL = "REFERRAL",
  VACCINATION = "VACCINATION",
  OTHER = "OTHER",
}

export enum CarePlanItemStatus {
  PENDING = "PENDING",
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export enum CarePlanStatus {
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

/** A minimal reference to whoever/whatever authored a piece of clinical content — never more than what's needed to show provenance. */
export interface ClinicalActorRefDto {
  providerOrganizationId: string | null;
  providerOrganizationName: string | null;
  providerUserId: string | null;
  providerUserDisplayTitle: string | null;
  userId: string | null;
}

export interface MedicalDocumentDto {
  id: string;
  petId: string;
  householdId: string;
  documentType: MedicalDocumentType;
  title: string;
  description: string | null;
  sourceType: SourceType;
  source: ClinicalActorRefDto;
  recordedAt: string | null;
  uploadedAt: string;
  mimeType: string;
  fileSizeBytes: number;
  visibility: DocumentVisibility;
  verificationStatus: DocumentVerificationStatus;
  relatedVisitId: string | null;
  relatedLabResultId: string | null;
  relatedImagingStudyId: string | null;
  relatedReferralId: string | null;
  voidedAt: string | null;
  voidedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Minted per-request after authorization — never store or cache this URL. */
export interface MedicalDocumentDownloadDto {
  downloadUrl: string;
  expiresInSeconds: number;
}

export interface MedicalRecordCorrectionDto {
  id: string;
  petId: string;
  targetType: CorrectableRecordType;
  targetId: string;
  correctionText: string;
  createdByUserId: string;
  status: MedicalRecordCorrectionStatus;
  resolvedAt: string | null;
  resolvedNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LabResultDto {
  id: string;
  petId: string;
  source: ClinicalActorRefDto;
  clinicalVisitId: string | null;
  testName: string;
  testCode: string | null;
  sampleDate: string | null;
  resultDate: string | null;
  value: string | null;
  unit: string | null;
  referenceRangeLow: number | null;
  referenceRangeHigh: number | null;
  qualitativeResult: string | null;
  status: LabResultStatus;
  flag: LabResultFlag | null;
  sourceType: SourceType;
  notes: string | null;
  supersedesId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImagingStudyDto {
  id: string;
  petId: string;
  source: ClinicalActorRefDto;
  clinicalVisitId: string | null;
  studyType: ImagingStudyType;
  bodyRegion: string | null;
  performedAt: string | null;
  report: string | null;
  findings: string | null;
  recommendation: string | null;
  sourceType: SourceType;
  voidedAt: string | null;
  voidedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReferralDto {
  id: string;
  petId: string;
  fromProviderOrganizationId: string;
  fromProviderOrganizationName: string;
  fromProviderUserId: string | null;
  toProviderOrganizationId: string | null;
  toProviderOrganizationName: string | null;
  externalProviderName: string | null;
  externalSpecialty: string | null;
  reason: string;
  notes: string | null;
  status: ReferralStatus;
  clinicalVisitId: string | null;
  fulfillingBookingId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
}

export interface DentalRecordDto {
  id: string;
  petId: string;
  source: ClinicalActorRefDto;
  clinicalVisitId: string | null;
  recordType: DentalRecordType;
  performedAt: string | null;
  findings: string | null;
  notes: string | null;
  followUpRecommended: boolean;
  followUpNotes: string | null;
  sourceType: SourceType;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalNutritionPlanDto {
  id: string;
  petId: string;
  source: ClinicalActorRefDto;
  clinicalVisitId: string | null;
  goal: string | null;
  dietType: DietType | null;
  recommendedFoodText: string | null;
  dailyAmountText: string | null;
  frequencyText: string | null;
  restrictionsText: string | null;
  startDate: string | null;
  endDate: string | null;
  status: CarePlanItemStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RehabSessionDto {
  id: string;
  rehabPlanId: string;
  sessionDate: string;
  observation: string | null;
  progressNotes: string | null;
  createdAt: string;
}

export interface RehabPlanDto {
  id: string;
  petId: string;
  source: ClinicalActorRefDto;
  clinicalVisitId: string | null;
  goal: string | null;
  exercisesText: string | null;
  frequencyText: string | null;
  durationText: string | null;
  status: RehabPlanStatus;
  sessions: RehabSessionDto[];
  createdAt: string;
  updatedAt: string;
}

/** Owner-recorded, never a diagnosis — the UI must always label this distinctly from clinical content. */
export interface PetObservationDto {
  id: string;
  petId: string;
  category: ObservationCategory;
  description: string;
  observedAt: string;
  mediaType: ObservationMediaType | null;
  hasMedia: boolean;
  sourceType: SourceType;
  recordedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalVisitRevisionDto {
  id: string;
  revisionNumber: number;
  snapshotStatus: ClinicalVisitStatus;
  snapshotReasonForVisit: string | null;
  snapshotHistoryText: string | null;
  snapshotObservationsText: string | null;
  snapshotAssessmentText: string | null;
  snapshotPlanText: string | null;
  amendedByProviderUserId: string;
  reason: string;
  createdAt: string;
}

export interface ClinicalVisitDto {
  id: string;
  petId: string;
  householdId: string;
  bookingId: string | null;
  providerOrganizationId: string;
  providerOrganizationName: string;
  providerUserId: string;
  providerUserDisplayTitle: string | null;
  reasonForVisit: string | null;
  historyText: string | null;
  observationsText: string | null;
  assessmentText: string | null;
  planText: string | null;
  status: ClinicalVisitStatus;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalVisitDetailDto extends ClinicalVisitDto {
  revisions: ClinicalVisitRevisionDto[];
}

export interface CarePlanItemDto {
  id: string;
  carePlanId: string;
  type: CarePlanItemType;
  title: string;
  detail: string | null;
  status: CarePlanItemStatus;
  source: SourceType;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CarePlanDto {
  id: string;
  petId: string;
  source: ClinicalActorRefDto;
  originatingVisitId: string | null;
  title: string;
  status: CarePlanStatus;
  notes: string | null;
  items: CarePlanItemDto[];
  createdAt: string;
  updatedAt: string;
}

export interface SeniorCareNoteDto {
  id: string;
  petId: string;
  mobilityNotes: string | null;
  cognitionNotes: string | null;
  medicationComplexityNotes: string | null;
  monitoringFrequencyText: string | null;
  qualityOfLifeNotes: string | null;
  sourceType: SourceType;
  createdAt: string;
  updatedAt: string;
}

export interface EndOfLifeCarePlanDto {
  petId: string;
  palliativeCareNotes: string | null;
  endOfLifePreferences: string | null;
  aftercarePreferences: string | null;
  sourceType: SourceType;
  createdAt: string;
  updatedAt: string;
}

/** Every kind of longitudinal health event, unified for the Health Timeline — read-only and derived (never stored), see HealthTimelineService. */
export enum HealthTimelineEntryType {
  VACCINATION = "VACCINATION",
  MEDICATION_STARTED = "MEDICATION_STARTED",
  MEDICATION_STOPPED = "MEDICATION_STOPPED",
  CONDITION_RECORDED = "CONDITION_RECORDED",
  ALLERGY_RECORDED = "ALLERGY_RECORDED",
  CLINICAL_VISIT = "CLINICAL_VISIT",
  LAB_RESULT = "LAB_RESULT",
  IMAGING_STUDY = "IMAGING_STUDY",
  REFERRAL = "REFERRAL",
  DENTAL_RECORD = "DENTAL_RECORD",
  NUTRITION_PLAN = "NUTRITION_PLAN",
  REHAB_SESSION = "REHAB_SESSION",
  OBSERVATION = "OBSERVATION",
  DOCUMENT_UPLOADED = "DOCUMENT_UPLOADED",
}

export interface HealthTimelineEntryDto {
  type: HealthTimelineEntryType;
  occurredAt: string;
  sourceType: SourceType;
  source: ClinicalActorRefDto;
  summary: string;
  /** The id of the underlying record, and which endpoint/type it belongs to — lets the UI deep-link into the full record. */
  recordId: string;
  recordType: HealthTimelineEntryType;
}

/** spec: "if a score cannot be responsibly calculated, do not show one" — there is deliberately no numeric health score field anywhere in this DTO. */
export interface HealthOverviewDto {
  petId: string;
  upcomingCare: CareCalendarEventDto[];
  overdueCare: CareCalendarEventDto[];
  activeMedicationsCount: number;
  unresolvedCarePlanItemsCount: number;
  recentDocuments: MedicalDocumentDto[];
  recentVisits: ClinicalVisitDto[];
  missingInformation: string[];
}

// ---------------------------------------------------------------------------
// Admin — Advanced Health / Clinical OS oversight (Handoff 17)
// ---------------------------------------------------------------------------

/** The coarse, permission-gated health summary the H13 support context panel shows — never the full clinical record. */
export interface SupportHealthSummaryDto {
  openMedicalDocumentsCount: number;
  recentClinicalVisit: { id: string; status: ClinicalVisitStatus; providerOrganizationName: string; startedAt: string } | null;
  openReferralsCount: number;
}

// ===========================================================================
// Handoff 18 — Lost Pet + Animal Support + Community + Memories
// ===========================================================================

export enum PetLifecycleTransitionSource {
  LOST_PET_INCIDENT = "LOST_PET_INCIDENT",
  MANUAL_MEMORIAL = "MANUAL_MEMORIAL",
}

export interface PetLifecycleTransitionDto {
  id: string;
  petId: string;
  fromStatus: PetLifecycleStatus;
  toStatus: PetLifecycleStatus;
  sourceType: PetLifecycleTransitionSource;
  sourceId: string | null;
  reason: string | null;
  actorUserId: string | null;
  createdAt: string;
}

export enum LostPetIncidentStatus {
  OPEN = "OPEN",
  SEARCHING = "SEARCHING",
  SIGHTING_REPORTED = "SIGHTING_REPORTED",
  FOUND = "FOUND",
  REUNITED = "REUNITED",
  CLOSED = "CLOSED",
}

export enum LostPetContactPreference {
  IN_APP_MESSAGE = "IN_APP_MESSAGE",
  MASKED_CONTACT = "MASKED_CONTACT",
  PUBLIC_CONTACT = "PUBLIC_CONTACT",
}

export enum LostPetSightingStatus {
  SUBMITTED = "SUBMITTED",
  REVIEWED = "REVIEWED",
  ACCEPTED = "ACCEPTED",
  REJECTED = "REJECTED",
}

/** The household/owner view — includes privateNotes and every field. Never returned to an anonymous caller. */
export interface LostPetIncidentDto {
  id: string;
  petId: string;
  petName: string;
  petSpecies: PetSpecies;
  petPhotoUrl: string | null;
  householdId: string;
  status: LostPetIncidentStatus;
  lastKnownLocation: string | null;
  lastKnownLatitude: number | null;
  lastKnownLongitude: number | null;
  lastSeenAt: string | null;
  description: string;
  publicNotes: string | null;
  privateNotes: string | null;
  primaryPhotoObjectKey: string | null;
  primaryPhotoUrl: string | null;
  contactPreference: LostPetContactPreference;
  publicContactMode: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  foundAt: string | null;
  reunitedAt: string | null;
  closedAt: string | null;
  sightingsCount: number;
}

/**
 * The anonymous/public view (spec: "Do NOT expose: owner's home address,
 * full phone number by default, private household information, private
 * medical history, internal notes"). No householdId, no privateNotes, no
 * createdByUserId, no raw contact detail — publicContactMode only, and only
 * when contactPreference is PUBLIC_CONTACT.
 */
export interface LostPetIncidentPublicDto {
  id: string;
  petName: string;
  petSpecies: PetSpecies;
  petBreed: string | null;
  petColorMarkings: string | null;
  petApproximateAgeMonths: number | null;
  primaryPhotoObjectKey: string | null;
  primaryPhotoUrl: string | null;
  status: LostPetIncidentStatus;
  lastKnownLocation: string | null;
  lastKnownLatitude: number | null;
  lastKnownLongitude: number | null;
  lastSeenAt: string | null;
  publicNotes: string | null;
  publicContactMode: string | null;
  createdAt: string;
}

export interface LostPetSightingDto {
  id: string;
  incidentId: string;
  reporterUserId: string | null;
  isAnonymous: boolean;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  seenAt: string;
  description: string | null;
  photoObjectKey: string | null;
  photoUrl: string | null;
  status: LostPetSightingStatus;
  createdAt: string;
  reviewedAt: string | null;
}

// ---------------------------------------------------------------------------
// Animal Support — organizations, rescue cases, campaigns, donations.
// ---------------------------------------------------------------------------

export enum AnimalSupportOrgType {
  NGO = "NGO",
  SHELTER = "SHELTER",
  RESCUE_GROUP = "RESCUE_GROUP",
}

export enum AnimalSupportVerificationStatus {
  NOT_STARTED = "NOT_STARTED",
  SUBMITTED = "SUBMITTED",
  NEEDS_INFORMATION = "NEEDS_INFORMATION",
  UNDER_REVIEW = "UNDER_REVIEW",
  VERIFIED = "VERIFIED",
  REJECTED = "REJECTED",
}

export interface AnimalSupportOrganizationDto {
  id: string;
  type: AnimalSupportOrgType;
  name: string;
  description: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  verificationStatus: AnimalSupportVerificationStatus;
  contactEmail: string | null;
  contactPhone: string | null;
  logoObjectKey: string | null;
  logoUrl: string | null;
  imageObjectKeys: string[];
  imageUrls: string[];
  isPubliclyListed: boolean;
  createdAt: string;
}

export enum RescueCaseStatus {
  OPEN = "OPEN",
  IN_TREATMENT = "IN_TREATMENT",
  FUNDRAISING = "FUNDRAISING",
  READY_FOR_ADOPTION = "READY_FOR_ADOPTION",
  RESOLVED = "RESOLVED",
  CLOSED = "CLOSED",
}

export interface RescueCaseDto {
  id: string;
  organizationId: string;
  organizationName: string;
  title: string;
  description: string;
  animalType: string | null;
  status: RescueCaseStatus;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  estimatedNeedIrr: number | null;
  evidenceObjectKeys: string[];
  evidenceUrls: string[];
  createdAt: string;
  closedAt: string | null;
}

export enum CampaignFundType {
  GENERAL = "GENERAL",
  RESTRICTED = "RESTRICTED",
}

export enum SupportCampaignStatus {
  DRAFT = "DRAFT",
  ACTIVE = "ACTIVE",
  PAUSED = "PAUSED",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

/**
 * raisedAmountIrr is always ledger-derived at read time (spec: "Do not fake
 * real-time raised amount from cached UI values") — never a stored column,
 * computed the same way DonationLedgerService.getCampaignRaised() sums
 * DonationTransaction rows.
 */
export interface SupportCampaignDto {
  id: string;
  organizationId: string;
  organizationName: string;
  rescueCaseId: string | null;
  title: string;
  description: string;
  fundType: CampaignFundType;
  targetAmountIrr: number | null;
  raisedAmountIrr: number;
  status: SupportCampaignStatus;
  createdAt: string;
  startsAt: string | null;
  endsAt: string | null;
}

export interface SupportCampaignUpdateDto {
  id: string;
  campaignId: string;
  title: string;
  body: string;
  evidenceObjectKeys: string[];
  evidenceUrls: string[];
  createdAt: string;
}

export enum DonationStatus {
  PENDING = "PENDING",
  SUCCEEDED = "SUCCEEDED",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
}

/** The donor's own donation-history view (spec: "Support clear receipt/history for authenticated donors"). Never shown to anyone but the donor themselves. */
export interface DonationHistoryItemDto {
  id: string;
  campaignId: string;
  campaignTitle: string;
  organizationName: string;
  amountIrr: number;
  fundType: CampaignFundType;
  status: DonationStatus;
  showDonorPublicly: boolean;
  createdAt: string;
  succeededAt: string | null;
  refundedAt: string | null;
}

/** The public campaign donor list entry — anonymous unless the donor explicitly opted in via showDonorPublicly. */
export interface PublicDonationEntryDto {
  displayName: string;
  amountIrr: number;
  createdAt: string;
}

export interface DonationFundBalanceDto {
  organizationId: string;
  generalAvailableIrr: number;
  restrictedAvailableIrr: number;
}

// ---------------------------------------------------------------------------
// Community.
// ---------------------------------------------------------------------------

export enum CommunityPostType {
  GENERAL = "GENERAL",
  QUESTION = "QUESTION",
  LOCAL = "LOCAL",
  LOST_PET_SHARE = "LOST_PET_SHARE",
  RESCUE = "RESCUE",
  ADOPTION = "ADOPTION",
  MEMORY = "MEMORY",
}

export enum CommunityContentStatus {
  PUBLISHED = "PUBLISHED",
  HIDDEN = "HIDDEN",
  REMOVED = "REMOVED",
}

export enum CommunitySourceType {
  USER = "USER",
  LOST_PET_INCIDENT = "LOST_PET_INCIDENT",
  SUPPORT_CAMPAIGN = "SUPPORT_CAMPAIGN",
}

export enum CommunityReactionType {
  LIKE = "LIKE",
  LOVE = "LOVE",
  HELPFUL = "HELPFUL",
}

export enum CommunityReportReason {
  SPAM = "SPAM",
  ABUSE = "ABUSE",
  MISINFORMATION = "MISINFORMATION",
  INAPPROPRIATE = "INAPPROPRIATE",
  OTHER = "OTHER",
}

export enum CommunityReportStatus {
  OPEN = "OPEN",
  ESCALATED = "ESCALATED",
  RESOLVED = "RESOLVED",
  DISMISSED = "DISMISSED",
}

/** A public-safe pet reference only — never a channel into the pet's private health/household data (spec: "A post referring to a pet should use an explicit public-safe pet representation"). */
export interface CommunityPostPetRefDto {
  id: string;
  name: string;
  species: PetSpecies;
  photoUrl: string | null;
}

export interface CommunityPostDto {
  id: string;
  authorUserId: string;
  authorDisplayName: string;
  type: CommunityPostType;
  title: string | null;
  body: string;
  locale: Locale | null;
  countryCode: string | null;
  pet: CommunityPostPetRefDto | null;
  mediaObjectKeys: string[];
  mediaUrls: string[];
  status: CommunityContentStatus;
  sourceType: CommunitySourceType;
  sourceLostPetIncidentId: string | null;
  sourceSupportCampaignId: string | null;
  commentCount: number;
  reactionCount: number;
  /** Only present when the request is authenticated — the caller's own reaction, if any. */
  viewerReaction: CommunityReactionType | null;
  createdAt: string;
}

export interface CommunityCommentDto {
  id: string;
  postId: string;
  authorUserId: string;
  authorDisplayName: string;
  body: string;
  status: CommunityContentStatus;
  createdAt: string;
}

export interface CommunityReportDto {
  id: string;
  postId: string | null;
  commentId: string | null;
  reason: CommunityReportReason;
  details: string | null;
  status: CommunityReportStatus;
  trustCaseId: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Memories + Life Timeline.
// ---------------------------------------------------------------------------

export enum PetMemoryType {
  PHOTO = "PHOTO",
  VIDEO = "VIDEO",
  MILESTONE = "MILESTONE",
  STORY = "STORY",
  BIRTHDAY = "BIRTHDAY",
  FIRST_DAY = "FIRST_DAY",
  ADOPTION_DAY = "ADOPTION_DAY",
  TRAVEL = "TRAVEL",
  ACHIEVEMENT = "ACHIEVEMENT",
  OTHER = "OTHER",
}

export enum PetMemoryVisibility {
  PRIVATE = "PRIVATE",
  PUBLIC = "PUBLIC",
}

export interface PetMemoryDto {
  id: string;
  petId: string;
  householdId: string;
  createdByUserId: string;
  type: PetMemoryType;
  title: string;
  description: string | null;
  occurredAt: string;
  mediaObjectKeys: string[];
  mediaUrls: string[];
  location: string | null;
  visibility: PetMemoryVisibility;
  createdAt: string;
  updatedAt: string;
}

/** One kind of event the derived Life Timeline can surface — broader than HealthTimelineEntryDto's own health-only scope, per spec: "Life Timeline should be broader than Health Timeline." */
export enum LifeTimelineEntryType {
  MEMORY = "MEMORY",
  HEALTH = "HEALTH",
  LOST_PET_RESOLVED = "LOST_PET_RESOLVED",
  ADOPTION = "ADOPTION",
  LIFECYCLE = "LIFECYCLE",
}

export interface LifeTimelineEntryDto {
  type: LifeTimelineEntryType;
  occurredAt: string;
  summary: string;
  /** The id of the underlying record and its own timeline-entry type (for a HEALTH entry, the wrapped HealthTimelineEntryDto's own recordType), so the UI can deep-link into the full record. */
  recordId: string;
  recordType: string;
}

// ---------------------------------------------------------------------------
// Admin — Lost Pet oversight (Handoff 18)
// ---------------------------------------------------------------------------

/** The coarse, permission-gated Lost Pet summary the H13 support context panel shows — never the full incident (no privateNotes, no sighting contact detail). */
export interface SupportLostPetSummaryDto {
  openIncidentsCount: number;
  mostRecentIncident: { id: string; status: LostPetIncidentStatus; createdAt: string } | null;
  sightingsCount: number;
}
