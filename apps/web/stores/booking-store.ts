import { create } from "zustand";
import { HealthAccessScopePreset } from "@petlife/types";

export interface BookingDraft {
  petId: string | null;
  providerId: string | null;
  providerName: string;
  locationId: string | null;
  locationLabel: string;
  serviceId: string | null;
  serviceName: string;
  durationMinutes: number;
  priceAmount: number | null;
  currency: string | null;
  providerUserId: string | null;
  slotStart: string | null;
  slotEnd: string | null;
  timezone: string | null;
  holdId: string | null;
  holdExpiresAt: string | null;
  reasonForVisit: string;
  healthAccessSelection: HealthAccessScopePreset;
  confirmIdempotencyKey: string;
}

interface BookingState extends BookingDraft {
  update: (patch: Partial<BookingDraft>) => void;
  reset: () => void;
}

const initialDraft: BookingDraft = {
  petId: null,
  providerId: null,
  providerName: "",
  locationId: null,
  locationLabel: "",
  serviceId: null,
  serviceName: "",
  durationMinutes: 0,
  priceAmount: null,
  currency: null,
  providerUserId: null,
  slotStart: null,
  slotEnd: null,
  timezone: null,
  holdId: null,
  holdExpiresAt: null,
  reasonForVisit: "",
  healthAccessSelection: HealthAccessScopePreset.HEALTH_BASICS,
  confirmIdempotencyKey: "",
};

/** Holds in-progress booking choices across the Find Vet -> Slot -> Review -> Health Sharing -> Confirm flow. */
export const useBookingStore = create<BookingState>((set) => ({
  ...initialDraft,
  update: (patch) => set(patch),
  reset: () => set(initialDraft),
}));
