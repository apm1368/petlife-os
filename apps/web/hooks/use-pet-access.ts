"use client";
import { useCallback, useEffect, useState } from "react";
import type { PetAccessFlags } from "@petlife/types";
import { petsService } from "@/services/pets.service";
export function usePetAccess(petId: string | null) {
  const [result, setResult] = useState<{ petId: string; access: PetAccessFlags | null; error: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    if (petId) void petsService.getMyAccess(petId)
      .then(access => { if (!cancelled) setResult({ petId, access, error: false }); })
      .catch(() => { if (!cancelled) setResult({ petId, access: null, error: true }); });
    return () => { cancelled = true; };
  }, [petId, attempt]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  // A new pet must never inherit even one render of the previous pet's permissions.
  return { access: result?.petId === petId ? result.access : null, error: result?.petId === petId && result.error, retry };
}
