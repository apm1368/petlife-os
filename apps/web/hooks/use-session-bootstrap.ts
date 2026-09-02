"use client";

import { useEffect } from "react";
import { authService } from "@/services/auth.service";
import { useSessionStore } from "@/stores/session-store";
import { ApiError } from "@/lib/api/client";

/**
 * The lightweight half of useAppBootstrap: resolves only the session (no
 * household/pets), for surfaces that must render *before* knowing whether
 * the visitor is signed in at all — a public discovery page (PublicShell)
 * or a single gated action (RequireAuth). AppShell's own private surfaces
 * keep using useAppBootstrap, which also seeds household/pet state.
 */
export function useSessionBootstrap(): void {
  const status = useSessionStore((s) => s.status);
  const setUser = useSessionStore((s) => s.setUser);

  useEffect(() => {
    if (status !== "idle") return;
    let cancelled = false;

    authService
      .getSession()
      .then(({ user }) => {
        if (!cancelled) setUser(user);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          setUser(null);
          return;
        }
        setUser(null);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
}
