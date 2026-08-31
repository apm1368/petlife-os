import { create } from "zustand";
import type { UserDto } from "@petlife/types";

interface SessionState {
  user: UserDto | null;
  status: "idle" | "loading" | "authenticated" | "unauthenticated";
  setUser: (user: UserDto | null) => void;
  setStatus: (status: SessionState["status"]) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  status: "idle",
  setUser: (user) => set({ user, status: user ? "authenticated" : "unauthenticated" }),
  setStatus: (status) => set({ status }),
}));
