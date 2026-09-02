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
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  SUSPENDED = "SUSPENDED",
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
