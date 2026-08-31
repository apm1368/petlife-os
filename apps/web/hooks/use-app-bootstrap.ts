"use client";

import { useEffect, useState } from "react";
import { authService } from "@/services/auth.service";
import { householdsService } from "@/services/households.service";
import { useSessionStore } from "@/stores/session-store";
import { usePetStore } from "@/stores/pet-store";
import { ApiError } from "@/lib/api/client";

interface BootstrapState {
  isLoading: boolean;
  error: string | null;
}

/**
 * Runs once per app shell mount: resolves the session, then this MVP's
 * "current household" (the first one the user belongs to), then that
 * household's pets and active pet — populating the client stores that
 * Home / My Pets / the pet switcher all read from.
 */
export function useAppBootstrap(): BootstrapState {
  const [state, setState] = useState<BootstrapState>({ isLoading: true, error: null });
  const setUser = useSessionStore((s) => s.setUser);
  const setHousehold = usePetStore((s) => s.setHousehold);
  const setPets = usePetStore((s) => s.setPets);
  const setActivePetId = usePetStore((s) => s.setActivePetId);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const { user } = await authService.getSession();
        if (cancelled) return;
        setUser(user);

        const households = await householdsService.listMine();
        if (cancelled) return;
        const household = households[0];
        if (!household) {
          setState({ isLoading: false, error: null });
          return;
        }

        setHousehold(household.id);
        const [pets, activePet] = await Promise.all([
          householdsService.listPets(household.id),
          householdsService.getActivePet(household.id),
        ]);
        if (cancelled) return;
        setPets(pets);
        setActivePetId(activePet?.id ?? null);
        setState({ isLoading: false, error: null });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          setUser(null);
          setState({ isLoading: false, error: null });
          return;
        }
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
