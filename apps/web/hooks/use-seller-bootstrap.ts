"use client";

import { useEffect, useState } from "react";
import { sellerOsService } from "@/services/seller-os.service";
import { useSellerStore } from "@/stores/seller-store";

interface BootstrapState {
  isLoading: boolean;
  error: string | null;
}

/** Resolves the caller's seller membership(s) once per Seller Shell mount — see SellerAccessService.getContextDto's doc comment on why this never throws. */
export function useSellerBootstrap(): BootstrapState {
  const [state, setState] = useState<BootstrapState>({ isLoading: true, error: null });
  const setContext = useSellerStore((s) => s.setContext);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const context = await sellerOsService.getContext();
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
