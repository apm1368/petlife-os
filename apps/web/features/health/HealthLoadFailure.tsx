"use client";

import { useTranslations } from "next-intl";
import { SystemState, systemStateFor } from "@/features/system/SystemState";

/** Health pages distinguish an offline browser from authorization and ordinary retryable failures. */
export function HealthLoadFailure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useTranslations("errors");
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return <SystemState kind="GENERIC_RETRYABLE_ERROR" title={t("offline")} description={t("offline")} onRetry={onRetry} />;
  }
  return <SystemState kind={systemStateFor(error)} onRetry={onRetry} />;
}
