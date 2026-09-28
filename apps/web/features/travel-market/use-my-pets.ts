"use client";

import { useEffect, useState } from "react";
import type { PetDto } from "@petlife/types";
import { householdsService } from "@/services/households.service";
import { useSessionStore } from "@/stores/session-store";

const KEY = "petlife.travel.petIds";

/** The signed-in household's pets (null while loading, [] for guests). */
export function useMyPets(): PetDto[] | null {
  const status = useSessionStore((s) => s.status);
  const [pets, setPets] = useState<PetDto[] | null>(null);
  useEffect(() => {
    if (status === "unauthenticated") return setPets([]);
    if (status !== "authenticated") return;
    let cancelled = false;
    void (async () => {
      try {
        const households = await householdsService.listMine();
        const lists = await Promise.all(households.map((h) => householdsService.listPets(h.id)));
        if (!cancelled) setPets(lists.flat().filter((p) => String(p.lifecycleStatus) === "ACTIVE"));
      } catch {
        if (!cancelled) setPets([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);
  return pets;
}

/**
 * The pets chosen for a trip are remembered in this browser only — private pet ids never go into
 * a shareable URL. The URL carries the anonymous shape (species, count) instead.
 */
export function readChosenPetIds(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

export function writeChosenPetIds(ids: string[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids.slice(0, 5)));
  } catch {
    /* storage unavailable: the choice simply is not remembered */
  }
}

export function petWeightKg(p: PetDto): number | null {
  if (p.latestWeightValue === null || p.latestWeightValue === undefined) return null;
  return p.latestWeightUnit === "LB" ? Math.round(p.latestWeightValue * 0.4536 * 10) / 10 : p.latestWeightValue;
}
