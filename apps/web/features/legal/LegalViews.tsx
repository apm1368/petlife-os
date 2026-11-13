import Link from "next/link";
import { useTranslations } from "next-intl";
import { CircleHelp, FileText, LifeBuoy, ShieldCheck } from "@petlife/ui";
import type { RouteLocale } from "@/lib/i18n/config";
import { formatLocaleDate } from "@/lib/i18n/format";
import type { BuiltinFaq, BuiltinLegalDocument, BuiltinLegalSlug } from "@/lib/legal/builtin";
import "./legal.css";

const href = (locale: RouteLocale, path: string) => `/${locale}${path}`;
const updatedLabel = (locale: RouteLocale, iso: string) => formatLocaleDate(`${iso}T12:00:00Z`, locale, { dateStyle: "long" });

/**
 * A built-in legal document (Terms or Privacy), server-rendered so search engines and app-store reviewers
 * read the full text. Section ids are stable across languages, so /legal/terms#orders works everywhere.
 */
export function BuiltinLegalView({ slug, doc, locale }: { slug: BuiltinLegalSlug; doc: BuiltinLegalDocument; locale: RouteLocale }) {
  const t = useTranslations("legalPages");
  const Icon = slug === "privacy" ? ShieldCheck : FileText;
  return (
    <article className="opl-page legal" aria-labelledby="legal-title">
      <header className="legal-hero">
        <div className="opl-wrap legal-hero__in">
          <p className="opl-eyebrow"><Icon size={16} aria-hidden="true" />{t(`eyebrow.${slug}`)}</p>
          <h1 id="legal-title" className="legal-hero__title">{doc.title}</h1>
          <p className="opl-lede legal-hero__lede">{doc.lede}</p>
          <p className="legal-updated">{t("updated", { date: updatedLabel(locale, doc.updated) })}</p>
        </div>
      </header>
      <div className="opl-wrap legal-body">
        <nav className="legal-toc" aria-label={t("onThisPage")}>
          <h2>{t("onThisPage")}</h2>
          <ol>{doc.sections.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.heading}</a></li>)}</ol>
        </nav>
        <div className="legal-sections">
          {doc.sections.map((section) => (
            <section key={section.id} id={section.id} className="legal-section" aria-labelledby={`${section.id}-h`}>
              <h2 id={`${section.id}-h`}>{section.heading}</h2>
              {section.paragraphs?.map((p, i) => <p key={i}>{p}</p>)}
              {section.items?.length ? <ul>{section.items.map((item, i) => <li key={i}>{item}</li>)}</ul> : null}
              {section.links?.length ? (
                <p className="legal-links">{section.links.map((l) => <Link key={l.href} href={href(locale, l.href)}>{l.label}</Link>)}</p>
              ) : null}
            </section>
          ))}
          <p className="legal-all"><Link href={href(locale, "/legal")}>{t("allLegal")}</Link></p>
        </div>
      </div>
    </article>
  );
}

/** The built-in FAQ: native <details> accordions (keyboard and screen-reader friendly, no script), grouped by topic. */
export function BuiltinFaqView({ faq, locale, more }: { faq: BuiltinFaq; locale: RouteLocale; more?: { slug: string; title: string }[] }) {
  const t = useTranslations("legalPages");
  return (
    <article className="opl-page legal legal--faq" aria-labelledby="faq-title">
      <header className="legal-hero">
        <div className="opl-wrap legal-hero__in">
          <p className="opl-eyebrow"><CircleHelp size={16} aria-hidden="true" />{t("eyebrow.faq")}</p>
          <h1 id="faq-title" className="legal-hero__title">{faq.title}</h1>
          <p className="opl-lede legal-hero__lede">{faq.lede}</p>
          <nav className="legal-chips" aria-label={t("onThisPage")}>
            <ul>{faq.groups.map((g) => <li key={g.id}><a href={`#${g.id}`}>{g.heading}</a></li>)}</ul>
          </nav>
        </div>
      </header>
      <div className="opl-wrap legal-faq">
        {faq.groups.map((group) => (
          <section key={group.id} id={group.id} className="legal-faq__group" aria-labelledby={`${group.id}-h`}>
            <h2 id={`${group.id}-h`}>{group.heading}</h2>
            {group.items.map((item, i) => (
              <details key={i} className="legal-faq__item">
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </section>
        ))}
        {more?.length ? (
          <section className="legal-faq__group" aria-labelledby="faq-more-h">
            <h2 id="faq-more-h">{t("faqMore")}</h2>
            <ul className="legal-faq__more">{more.map((a) => <li key={a.slug}><Link href={href(locale, `/help/articles/${a.slug}`)}>{a.title}</Link></li>)}</ul>
          </section>
        ) : null}
        <aside className="legal-help">
          <LifeBuoy size={22} aria-hidden="true" />
          <div>
            <h2>{t("stillNeedHelp")}</h2>
            <p className="legal-links">
              <Link href={href(locale, "/support")}>{t("contactSupport")}</Link>
              <Link href={href(locale, "/legal/terms")}>{t("terms")}</Link>
              <Link href={href(locale, "/legal/privacy")}>{t("privacy")}</Link>
            </p>
          </div>
        </aside>
      </div>
    </article>
  );
}
