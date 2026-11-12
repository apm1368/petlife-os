"use client";

import { ParkFooter } from "@/features/landing/ParkFooter";
import type { RouteLocale } from "@/lib/i18n/config";

/** Public routes share the landing's pattern footer (docs/design/pattern-2026-11), including the Cookie switch. Render inside LandingShell. */
export function PublicFooter({ locale }: { locale: RouteLocale }) {
  return <ParkFooter locale={locale} />;
}
