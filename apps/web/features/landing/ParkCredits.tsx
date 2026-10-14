import type { AppLocale } from "@/lib/i18n/config";
import { parkCopy } from "./park-copy";

export function ParkCredits({ locale }: { locale: AppLocale }) {
  const c = parkCopy[locale];
  return <section className="park-credits rounded-lg border border-border-subtle bg-surface-subtle p-5" aria-labelledby="park-credits-title">
    <h2 id="park-credits-title" className="text-section-title">{c.creditsTitle}</h2>
    <p className="mt-3 text-body leading-relaxed text-text-secondary">{c.creditsBody}</p>
    <p className="mt-2 text-metadata text-text-secondary">{c.processing}</p>
  </section>;
}
