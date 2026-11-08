"use client";

import { Button } from "@petlife/ui";
import { useDisplayModeStore } from "@/stores/display-mode-store";
import type { RouteLocale } from "@/lib/i18n/config";

const displayCopy: Record<RouteLocale, { label: string; on: string; off: string }> = {
  fa: { label: "نمایش ساده", on: "روشن", off: "خاموش" },
  en: { label: "Simple display", on: "on", off: "off" },
  de: { label: "Einfache Ansicht", on: "ein", off: "aus" },
  es: { label: "Vista sencilla", on: "activada", off: "desactivada" },
};

export function DisplayModeToggle({ locale, compact = false }: { locale: RouteLocale; compact?: boolean }) {
  const simple = useDisplayModeStore((state) => state.simple);
  const setSimple = useDisplayModeStore((state) => state.setSimple);
  const { label, on, off } = displayCopy[locale];
  const stateLabel = simple ? on : off;

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
