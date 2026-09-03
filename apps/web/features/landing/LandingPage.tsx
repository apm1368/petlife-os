import type { AppLocale } from "@/lib/i18n/config";
import { SpatialLanding } from "./SpatialLanding";
import "./landing.css";
export function LandingPage({ locale }: { locale: AppLocale }) {
  return <SpatialLanding locale={locale} />;
}
