"use client";

import { useEffect, useState } from "react";
import { providerOsService } from "@/services/provider-os.service";
import { useProviderStore } from "@/stores/provider-store";

interface BootstrapState {
  isLoading: boolean;
  error: string | null;
}

/** Resolves the caller's provider membership(s) once per Provider Shell mount — see ProviderContextService.getContextDto's doc comment on why this never throws. */
export function useProviderBootstrap(): BootstrapState {
  const [state, setState] = useState<BootstrapState>({ isLoading: true, error: null });
  const setContext = useProviderStore((s) => s.setContext);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const context = await providerOsService.getContext();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
