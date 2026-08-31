import { z } from "zod";
import { NeuteredStatus, PetInterest, PetSex, PetSpecies, WeightUnit } from "@petlife/types";

export const requestOtpSchema = z.object({
  identifier: z.string().trim().min(3).max(320),
});

export const verifyOtpSchema = z.object({
  identifier: z.string().trim().min(3).max(320),
  code: z.string().trim().length(6).regex(/^\d{6}$/, "OTP must be 6 digits"),
});

export const updateMeSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  locale: z.enum(["fa", "en"]).optional(),
  themePreference: z.enum(["SYSTEM", "LIGHT", "DARK"]).optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

export const createHouseholdSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  region: z.string().trim().min(1).max(120).optional(),
  countryCode: z.string().trim().length(2).optional(),
});

export const updateHouseholdSchema = createHouseholdSchema.partial();

const birthOrApproxAge = (data: { birthDate?: string | null; approximateAgeMonths?: number | null }) =>
  Boolean(data.birthDate) || typeof data.approximateAgeMonths === "number";

export const createPetSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    species: z.nativeEnum(PetSpecies),
    breed: z.string().trim().min(1).max(120).optional(),
    sex: z.nativeEnum(PetSex).optional(),
    birthDate: z.string().date().optional(),
    approximateAgeMonths: z.number().int().min(0).max(600).optional(),
    photoUrl: z.string().url().optional(),
    latestWeightValue: z.number().positive().optional(),
    latestWeightUnit: z.nativeEnum(WeightUnit).optional(),
    colorMarkings: z.string().trim().max(200).optional(),
    neuteredStatus: z.nativeEnum(NeuteredStatus).optional(),
    microchipNumber: z.string().trim().max(64).optional(),
  })
  .refine(birthOrApproxAge, {
    message: "Either birthDate or approximateAgeMonths is required",
    path: ["birthDate"],
  });

export const updatePetSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  breed: z.string().trim().min(1).max(120).nullable().optional(),
  sex: z.nativeEnum(PetSex).nullable().optional(),
  birthDate: z.string().date().nullable().optional(),
  approximateAgeMonths: z.number().int().min(0).max(600).nullable().optional(),
  photoUrl: z.string().url().nullable().optional(),
  latestWeightValue: z.number().positive().nullable().optional(),
  latestWeightUnit: z.nativeEnum(WeightUnit).nullable().optional(),
  colorMarkings: z.string().trim().max(200).nullable().optional(),
  neuteredStatus: z.nativeEnum(NeuteredStatus).nullable().optional(),
  microchipNumber: z.string().trim().max(64).nullable().optional(),
});

export const setActivePetSchema = z.object({
  petId: z.string().uuid(),
});

export const onboardingProgressSchema = z.object({
  chapter: z.enum(["ACCOUNT", "HOUSEHOLD", "PET_IDENTITY", "PERSONALIZATION", "READY"]),
  step: z.string().trim().min(1).max(80),
  status: z.enum(["IN_PROGRESS", "COMPLETED", "SKIPPED"]),
  householdId: z.string().uuid().optional(),
  petId: z.string().uuid().optional(),
  interests: z.array(z.nativeEnum(PetInterest)).optional(),
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type CreatePetInput = z.infer<typeof createPetSchema>;
export type UpdatePetInput = z.infer<typeof updatePetSchema>;
export type OnboardingProgressInput = z.infer<typeof onboardingProgressSchema>;
