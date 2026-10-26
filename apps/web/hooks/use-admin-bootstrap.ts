"use client";

import { useEffect, useState } from "react";
import { adminService } from "@/services/admin.service";
import { useAdminStore } from "@/stores/admin-store";

interface BootstrapState {
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

/** Resolves the caller's admin identity once per Admin Shell mount — mirrors useSellerBootstrap/useProviderBootstrap exactly. GET /admin/me never throws for a non-admin session (see AdminMeController's own doc comment), so `error` here only ever reflects a real network/session failure. */
export function useAdminBootstrap(): BootstrapState {
  const [state, setState] = useState<Omit<BootstrapState, "retry">>({ isLoading: true, error: null });
  const [revision, setRevision] = useState(0);
  const setContext = useAdminStore((s) => s.setContext);
  const clearContext = useAdminStore((s) => s.clearContext);

  useEffect(() => {
    let cancelled = false;
    clearContext();
    setState({ isLoading: true, error: null });
    async function run() {
      try {
        const context = await adminService.getMe();
        if (cancelled) return;
        setContext(context);
        setState({ isLoading: false, error: null });
      } catch (error) {
        if (cancelled) return;
        setState({ isLoading: false, error: error instanceof Error ? error.message : "unknown" });
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [setContext, clearContext, revision]);

  return { ...state, retry: () => setRevision(value => value + 1) };
}
