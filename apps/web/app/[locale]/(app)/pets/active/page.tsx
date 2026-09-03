"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Skeleton } from "@petlife/ui";
import { useActivePet } from "@/hooks/use-active-pet";

export default function ActivePetRedirectPage() {
  const { activePetId } = useActivePet();
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    if (activePetId) {
      // Resolve the landing's health destination only after the protected shell
      // has loaded the real household pet. The demo Cookie ID is never used.
      const health = new URLSearchParams(window.location.search).get("landingAction") === "health";
      router.replace(`/${locale}/pets/${activePetId}${health ? "/health" : ""}`);
    }
  }, [activePetId, locale, router]);

  return <Skeleton className="h-40 w-full" aria-label="Loading" />;
}
