import { create } from "zustand";
import type { ProviderContextDto } from "@petlife/types";

interface ProviderState {
  context: ProviderContextDto | null;
  status: "idle" | "loading" | "ready" | "not-a-provider" | "ambiguous";
  setContext: (context: ProviderContextDto) => void;
}

/** Derives status from the context shape rather than storing it redundantly — see ProviderShell's bootstrap effect. */
function statusFor(context: ProviderContextDto): ProviderState["status"] {
  if (context.memberships.length === 0) return "not-a-provider";
  if (!context.active) return "ambiguous";
  return "ready";
}

export const useProviderStore = create<ProviderState>((set) => ({
  context: null,
  status: "idle",
  setContext: (context) => set({ context, status: statusFor(context) }),
}));
