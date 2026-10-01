import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ContextSurface } from "@petlife/ui";

/**
 * The public landing page — the first thing an anonymous visitor sees at `/fa`.
 *
 * Before this existed, `/[locale]` redirected straight to `/home`, which lives
 * in the authenticated `(app)` group, so AppShell bounced every anonymous
 * visitor to the login screen. The product's own public surfaces (shop, vet
 * discovery, lost pets, blog, places, insurance, community, animal support)
 * were unreachable without an account even though none of them require one.
 *
 * Deliberately a server component with no client state: this is the most
 * SEO-relevant page in the product, and it must render fully without a
 * session. Every destination below is a real, already-shipped public route —
 * nothing here links to a page that does not exist.
 *
 * Visual design is intentionally minimal and token-only; the layout and copy
 * structure are the contract, the styling is Codex's to develop.
 */

/** Each entry is a shipped public route — keep this list and the (public) route tree in sync. */
const DESTINATIONS = [
  { key: "vet", href: "vet/find" },
  { key: "services", href: "services" },
  { key: "shop", href: "shop" },
  { key: "lostPets", href: "lost-pets" },
  { key: "places", href: "places" },
  { key: "insurance", href: "insurance" },
  { key: "animalSupport", href: "animal-support/needs" },
  { key: "community", href: "community" },
] as const;

export async function LandingView({ locale }: { locale: string }) {
  const t = await getTranslations("landing");

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-hero text-text-primary">{t("hero.title")}</h1>
        <p className="text-body text-text-secondary">{t("hero.subtitle")}</p>
        <div className="flex flex-wrap gap-3 pt-1">
          {/* The primary action is to browse, not to sign up: an anonymous
              visitor can reach real value before being asked for anything. */}
          <Link
            href={`/${locale}/vet/find`}
            className="rounded-md bg-brand-mint px-4 py-2 text-body text-text-inverse"
          >
            {t("hero.primaryCta")}
          </Link>
          <Link
            href={`/${locale}/shop`}
            className="rounded-md border border-border-subtle px-4 py-2 text-body text-text-primary"
          >
            {t("hero.secondaryCta")}
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-section-title text-text-primary">{t("explore.title")}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DESTINATIONS.map(({ key, href }) => (
            <Link key={key} href={`/${locale}/${href}`}>
              <ContextSurface className="flex h-full flex-col gap-1">
                <span className="text-body text-text-primary">{t(`explore.${key}.title`)}</span>
                <span className="text-metadata text-text-secondary">{t(`explore.${key}.description`)}</span>
              </ContextSurface>
            </Link>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-section-title text-text-primary">{t("account.title")}</h2>
        <p className="text-body text-text-secondary">{t("account.description")}</p>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/${locale}/register`}
            className="rounded-md bg-brand-mint px-4 py-2 text-body text-text-inverse"
          >
            {t("account.createAccount")}
          </Link>
          <Link
            href={`/${locale}/welcome`}
            className="rounded-md border border-border-subtle px-4 py-2 text-body text-text-primary"
          >
            {t("account.logIn")}
          </Link>
        </div>
      </section>
    </div>
  );
}
