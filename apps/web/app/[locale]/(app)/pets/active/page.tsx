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
    if (activePetId) router.replace(`/${locale}/pets/${activePetId}`);
  }, [activePetId, locale, router]);

  return <Skeleton className="h-40 w-full" aria-label="Loading" />;
}
