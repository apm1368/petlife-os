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
    const view = new URLSearchParams(window.location.search).get("view");
    const suffix = view === "health" || view === "care" ? `/${view}` : "";
    router.replace(activePetId ? `/${locale}/pets/${encodeURIComponent(activePetId)}${suffix}` : `/${locale}/pets`);
  }, [activePetId, locale, router]);

  return <Skeleton className="h-40 w-full" aria-label="Loading" />;
}
