import { create } from "zustand";
import type { AdminSessionContextDto } from "@petlife/types";

interface AdminState {
  context: AdminSessionContextDto | null;
  status: "idle" | "loading" | "ready" | "not-an-admin";
  setContext: (context: AdminSessionContextDto) => void;
}

export const useAdminStore = create<AdminState>((set) => ({
  context: null,
  status: "idle",
  setContext: (context) => set({ context, status: context.isAdmin ? "ready" : "not-an-admin" }),
}));
