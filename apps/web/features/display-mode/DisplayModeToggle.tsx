"use client";

import { Button } from "@petlife/ui";
import { useDisplayModeStore } from "@/stores/display-mode-store";
import type { AppLocale } from "@/lib/i18n/config";

export function DisplayModeToggle({ locale, compact = false }: { locale: AppLocale; compact?: boolean }) {
  const simple = useDisplayModeStore((state) => state.simple);
  const setSimple = useDisplayModeStore((state) => state.setSimple);
  const label = locale === "fa" ? "نمایش ساده" : "Simple display";
  const stateLabel = simple
    ? locale === "fa" ? "روشن" : "on"
    : locale === "fa" ? "خاموش" : "off";

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-pressed={simple}
      aria-label={`${label}: ${stateLabel}`}
      onClick={() => setSimple(!simple)}
      className={compact ? "display-mode-toggle display-mode-toggle--compact" : "display-mode-toggle"}
    >
      <span aria-hidden="true">Aa</span>
      {!compact ? <span>{label}</span> : null}
    </Button>
  );
}
