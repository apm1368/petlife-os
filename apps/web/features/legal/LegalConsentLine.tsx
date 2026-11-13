import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

/** One line of consent with links to the Terms (and its returns section) and the Privacy Policy, opened in a new tab so a form is never lost. */
export function LegalConsentLine({ kind, locale, className }: { kind: "consent" | "checkoutConsent"; locale: string; className?: string }) {
  const t = useTranslations("legalPages");
  const link = (path: string) => function LegalLink(chunks: ReactNode) {
    return <Link href={`/${locale}${path}`} target="_blank" rel="noopener" className="underline">{chunks}</Link>;
  };
  return <p className={className ?? "text-metadata text-text-secondary"}>{t.rich(kind, { terms: link("/legal/terms"), privacy: link("/legal/privacy"), returns: link("/legal/terms#orders") })}</p>;
}
