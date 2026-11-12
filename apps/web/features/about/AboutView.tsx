import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  BadgeCheck, BookOpen, CircleHelp, Download, Globe, HandHeart, Heart, HeartPulse, Images, LifeBuoy, LockKeyhole, Mail,
  PawPrint, Plane, Receipt, ShieldCheck, ShoppingBag, Sparkles, Stethoscope,
} from "@petlife/ui";
import "./about.css";

type Icon = typeof HeartPulse;
const STEPS: { key: string; icon: Icon; href: string }[] = [
  { key: "record", icon: HeartPulse, href: "/register" },
  { key: "care", icon: Stethoscope, href: "/services" },
  { key: "shop", icon: ShoppingBag, href: "/shop" },
  { key: "travel", icon: Plane, href: "/travel" },
  { key: "safety", icon: ShieldCheck, href: "/lost-pets" },
  { key: "together", icon: HandHeart, href: "/community" },
  { key: "learn", icon: BookOpen, href: "/blog" },
];
const PROMISES: { key: string; icon: Icon; href?: string }[] = [
  { key: "verified", icon: BadgeCheck, href: "/vet/find" },
  { key: "consent", icon: LockKeyhole },
  { key: "privacy", icon: Download },
  { key: "sources", icon: Globe, href: "/travel/external" },
  { key: "ledger", icon: Receipt, href: "/animal-support/campaigns" },
  { key: "credits", icon: Images, href: "/credits" },
];
const VALUES: { key: string; icon: Icon }[] = [
  { key: "animals", icon: PawPrint },
  { key: "honest", icon: CircleHelp },
  { key: "simple", icon: Sparkles },
  { key: "kindness", icon: Heart },
];
const CHAPTERS = ["why", "connect", "promises", "values", "contact"] as const;

/**
 * The About page: a story told in five numbered chapters (why → how the parts connect → what we promise → how we
 * decide → talk to us). Server-rendered copy only; every claim points at a feature a visitor can open and check.
 */
export function AboutView() {
  const t = useTranslations("aboutPage");
  const locale = useLocale();
  const href = (path: string) => `/${locale}${path}`;
  const num = (i: number) => new Intl.NumberFormat(locale === "fa" ? "fa-IR" : locale, { minimumIntegerDigits: 2 }).format(i + 1);
  return (
    <article className="opl-page about" aria-labelledby="about-title">
      <header className="about-hero">
        <div className="opl-wrap about-hero__in">
          <p className="opl-eyebrow"><PawPrint size={16} aria-hidden="true" />{t("eyebrow")}</p>
          <h1 id="about-title" className="about-hero__title">{t("title")}</h1>
          <p className="opl-lede about-hero__lede">{t("lede")}</p>
          <nav className="about-chapters" aria-label={t("chapters.label")}>
            <ol>
              {CHAPTERS.map((key, i) => <li key={key}><a href={`#about-${key}`}><b>{num(i)}</b>{t(`chapters.${key}`)}</a></li>)}
            </ol>
          </nav>
        </div>
      </header>

      <section id="about-why" className="opl-sec about-sec about-why" aria-labelledby="about-why-title">
        <div className="opl-wrap about-split">
          <p className="about-num" aria-hidden="true">{num(0)}</p>
          <div>
            <h2 id="about-why-title" className="opl-h2">{t("why.title")}</h2>
            <div className="about-prose">
              <p>{t("why.p1")}</p>
              <p>{t("why.p2")}</p>
              <p>{t("why.p3")}</p>
            </div>
          </div>
        </div>
      </section>

      <section id="about-connect" className="opl-sec about-sec about-connect" aria-labelledby="about-connect-title">
        <div className="opl-wrap">
          <div className="about-split">
            <p className="about-num" aria-hidden="true">{num(1)}</p>
            <div>
              <h2 id="about-connect-title" className="opl-h2">{t("connect.title")}</h2>
              <p className="opl-lede">{t("connect.lede")}</p>
            </div>
          </div>
          <ol className="about-path">
            {STEPS.map(({ key, icon: StepIcon, href: path }) => (
              <li key={key} className="about-path__step">
                <span className="about-path__ic" aria-hidden="true"><StepIcon size={22} /></span>
                <div>
                  <h3>{t(`connect.steps.${key}.title`)}</h3>
                  <p>{t(`connect.steps.${key}.body`)}</p>
                  <Link href={href(path)} className="about-link">{t(`connect.steps.${key}.cta`)}</Link>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="about-promises" className="opl-sec about-sec about-promises" aria-labelledby="about-promises-title">
        <div className="opl-wrap">
          <div className="about-split">
            <p className="about-num" aria-hidden="true">{num(2)}</p>
            <div>
              <h2 id="about-promises-title" className="opl-h2">{t("promises.title")}</h2>
              <p className="opl-lede">{t("promises.lede")}</p>
            </div>
          </div>
          <ul className="about-grid">
            {PROMISES.map(({ key, icon: PromiseIcon, href: path }) => (
              <li key={key} className="about-card">
                <span className="about-card__ic" aria-hidden="true"><PromiseIcon size={20} /></span>
                <h3>{path ? <Link href={href(path)}>{t(`promises.items.${key}.title`)}</Link> : t(`promises.items.${key}.title`)}</h3>
                <p>{t(`promises.items.${key}.body`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="about-values" className="opl-sec about-sec about-values" aria-labelledby="about-values-title">
        <div className="opl-wrap">
          <div className="about-split">
            <p className="about-num" aria-hidden="true">{num(3)}</p>
            <h2 id="about-values-title" className="opl-h2">{t("values.title")}</h2>
          </div>
          <ul className="about-values__list">
            {VALUES.map(({ key, icon: ValueIcon }) => (
              <li key={key}>
                <ValueIcon size={22} aria-hidden="true" />
                <div><h3>{t(`values.items.${key}.title`)}</h3><p>{t(`values.items.${key}.body`)}</p></div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="about-contact" className="opl-sec about-sec about-contact" aria-labelledby="about-contact-title">
        <div className="opl-wrap about-split">
          <p className="about-num" aria-hidden="true">{num(4)}</p>
          <div className="about-contact__card">
            <h2 id="about-contact-title" className="opl-h2">{t("contact.title")}</h2>
            <p className="opl-lede">{t("contact.body")}</p>
            <div className="opl-actions">
              <Link href={href("/contact")} className="opl-btn primary"><Mail size={18} aria-hidden="true" />{t("contact.contactCta")}</Link>
              <Link href={href("/help")} className="opl-btn soft"><LifeBuoy size={18} aria-hidden="true" />{t("contact.helpCta")}</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="about-cta" aria-labelledby="about-cta-title">
        <div className="opl-wrap about-cta__in">
          <h2 id="about-cta-title">{t("cta.title")}</h2>
          <p>{t("cta.body")}</p>
          <div className="opl-actions">
            <Link href={href("/register")} className="opl-btn sun">{t("cta.primary")}</Link>
            <Link href={href("/services")} className="opl-btn soft">{t("cta.secondary")}</Link>
          </div>
        </div>
      </section>
    </article>
  );
}
