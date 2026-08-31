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
  FIND_VET = "FIND_VET",
  VIEW_PROFILE = "VIEW_PROFILE",
  ASK_AI = "ASK_AI",
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
