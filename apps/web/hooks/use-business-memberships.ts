"use client";

import { useEffect, useState } from "react";
import type { BusinessMembershipsDto } from "@petlife/types";
import { businessService } from "@/services/business.service";

/** One request per signed-in user per page load: header links ask often, memberships rarely change. */
const cache = new Map<string, Promise<BusinessMembershipsDto | null>>();

export function useBusinessMemberships(userId: string | null | undefined): BusinessMembershipsDto | null {
  const [value, setValue] = useState<BusinessMembershipsDto | null>(null);
  useEffect(() => {
    if (!userId) {
      setValue(null);
      return;
    }
    let live = true;
    let pending = cache.get(userId);
    if (!pending) {
      pending = businessService.memberships().catch(() => null);
      cache.set(userId, pending);
    }
    void pending.then((m) => live && setValue(m));
    return () => {
      live = false;
    };
  }, [userId]);
  return value;
}

/** Tests and sign-out start from a clean slate. */
export function resetBusinessMembershipsCache() {
  cache.clear();
}
