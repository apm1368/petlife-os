"use client";

import { useSyncExternalStore } from "react";
import type { AdminDashboardSummaryDto } from "@petlife/types";
import { adminService } from "@/services/admin.service";

/**
 * The staff-queue counts (GET /admin/dashboard), shared by the sidebar badges, the module tabs and the
 * dashboard's "needs attention" board so one page view costs one request. Navigating refreshes them at most
 * once a minute; the dashboard forces a fresh read.
 */
type State = { summary: AdminDashboardSummaryDto | null; error: unknown; loading: boolean; loadedAt: number };

let state: State = { summary: null, error: null, loading: false, loadedAt: 0 };
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const STALE_MS = 60_000;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function refreshQueues(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && state.loadedAt && Date.now() - state.loadedAt < STALE_MS) return Promise.resolve();
  set({ loading: true });
  inflight = Promise.resolve()
    .then(() => adminService.getDashboard())
    .then((summary) => set({ summary, error: null, loading: false, loadedAt: Date.now() }))
    .catch((error: unknown) => set({ error, loading: false, loadedAt: Date.now() }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Forget everything (sign-out, a different admin in the same tab, tests). */
export function resetQueues() {
  inflight = null;
  set({ summary: null, error: null, loading: false, loadedAt: 0 });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => state;
const EMPTY: State = { summary: null, error: null, loading: false, loadedAt: 0 };
const serverSnapshot = () => EMPTY;

export function useQueues(): State {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
