"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { EmptyState, Skeleton } from "@petlife/ui";
import { servicesService } from "@/services/services.service";

export function LegacyServiceBookingRedirect({ serviceId }: { serviceId: string }) {
  const router = useRouter();
  const locale = useLocale();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    void servicesService
      .getDetail(serviceId)
      .then((detail) => router.replace(`/${locale}/providers/${detail.provider.id}/book?serviceId=${serviceId}`))
      .catch(() => setMissing(true));
  }, [serviceId, locale, router]);
  return missing ? <EmptyState title={locale === "fa" ? "این خدمت دیگر ارائه نمی‌شود" : "This service is no longer offered"} /> : <Skeleton className="h-64 w-full" />;
}
