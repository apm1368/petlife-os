import { create } from "zustand";
import type { SellerContextDto } from "@petlife/types";

interface SellerState {
  context: SellerContextDto | null;
  status: "idle" | "loading" | "ready" | "not-a-seller" | "ambiguous";
  setContext: (context: SellerContextDto) => void;
}

/** Derives status from the context shape rather than storing it redundantly — mirrors useProviderStore (Handoff 05). */
function statusFor(context: SellerContextDto): SellerState["status"] {
  if (context.memberships.length === 0) return "not-a-seller";
  if (!context.active) return "ambiguous";
  return "ready";
}

export const useSellerStore = create<SellerState>((set) => ({
  context: null,
  status: "idle",
  setContext: (context) => set({ context, status: statusFor(context) }),
}));
