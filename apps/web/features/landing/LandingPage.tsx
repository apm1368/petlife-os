import type { AppLocale } from "@/lib/i18n/config";
import { TehranLanding } from "./TehranLanding";
import "./landing.css";

export function LandingPage({ locale }: { locale: AppLocale }) {
  return <TehranLanding locale={locale} />;
}
