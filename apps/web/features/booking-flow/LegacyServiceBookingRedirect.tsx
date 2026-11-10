"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import { servicesService } from "@/services/services.service";
import { ApiError } from "@/lib/api/client";

export function LegacyServiceBookingRedirect({ serviceId }: { serviceId: string }) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("bookingFlow");
  const [state, setState] = useState<"loading" | "missing" | "error">("loading");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setState("loading");
    void servicesService
      .getDetail(serviceId)
      .then((detail) => {
        if (active) router.replace(`/${locale}/providers/${encodeURIComponent(detail.provider.id)}/book?serviceId=${encodeURIComponent(serviceId)}`);
      })
      .catch((error: unknown) => {
        if (active) setState(error instanceof ApiError && error.status === 404 ? "missing" : "error");
      });
    return () => { active = false; };
  }, [serviceId, locale, router, revision]);
  if (state === "missing") return <EmptyState title={t("serviceMissing")} />;
  if (state === "error") return <ErrorRecovery title={t("loadFailed")} message={t("errors.generic")} retryLabel={t("retry")} onRetry={() => setRevision(value => value + 1)} />;
  return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;
}
