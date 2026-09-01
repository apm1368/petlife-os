import { create } from "zustand";
import { LocationMode, ServiceCategory } from "@petlife/types";
import type { PetAccessScopePreset } from "@petlife/types";

export interface BookingDraft {
  petId: string | null;
  category: ServiceCategory | null;
  providerId: string | null;
  providerName: string;
  locationId: string | null;
  locationLabel: string;
  locationMode: LocationMode | null;
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
  accessSelection: PetAccessScopePreset | null;
  customerAddressId: string | null;
  dropoffAddressId: string | null;
  confirmIdempotencyKey: string;
}

interface BookingState extends BookingDraft {
  update: (patch: Partial<BookingDraft>) => void;
  reset: () => void;
}

const initialDraft: BookingDraft = {
  petId: null,
  category: null,
  providerId: null,
  providerName: "",
  locationId: null,
  locationLabel: "",
  locationMode: null,
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
  accessSelection: null,
  customerAddressId: null,
  dropoffAddressId: null,
  confirmIdempotencyKey: "",
};

/** Holds in-progress booking choices across the Explore Services -> Slot/Range -> Review -> Care Sharing -> Confirm flow, for any service category. */
export const useBookingStore = create<BookingState>((set) => ({
  ...initialDraft,
  update: (patch) => set(patch),
  reset: () => set(initialDraft),
}));
