import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Fingerprint, CalendarDays, Images, HeartPulse, LockKeyhole, FileText, CircleHelp, PawPrint } from "@petlife/ui";
import type { AppLocale } from "@/lib/i18n/config";
import { ParkHeader } from "./ParkHeader";
import { ParkHero } from "./ParkHero";
import { ParkFooter } from "./ParkFooter";
import { storyCopy } from "./story-copy";

const facts = [Fingerprint, HeartPulse, CalendarDays, Images];
const trustIcons = [LockKeyhole, FileText, CircleHelp];
const photo = (name: string) => `/images/landing/home/${name}.webp`;

export function HomeLanding({ locale }: { locale: AppLocale }) {
  const c = storyCopy[locale];
  const href = (path: string) => `/${locale}${path}`;
  const Arrow = locale === "fa" ? ArrowLeft : ArrowRight;
  return <div className="park-landing">
    <ParkHeader locale={locale} />
    <main id="lp-main" tabIndex={-1}>
      <ParkHero locale={locale} />
      <section id="park-about" className="park-story park-identity" aria-labelledby="park-identity-title">
        <div className="park-identity__photos">
          <Image unoptimized src={photo("cookie")} alt={c.cookieAlt} width={700} height={800} className="park-identity__cookie" />
          <div className="park-identity__caption"><PawPrint size={21} aria-hidden="true" /><span><strong>{c.cookie}</strong><small>{c.example}</small></span></div>
          <figure className="park-identity__app"><Image unoptimized src={photo("app-screen")} alt={c.appAlt} width={390} height={844} /><figcaption>{c.appExample}</figcaption></figure>
        </div>
        <div className="park-story__copy">
          <p className="park-eyebrow">{c.eyebrow}</p>
          <h2 id="park-identity-title">{c.identityTitle}</h2>
          <p>{c.identityBody}</p>
          <ul className="park-identity__facts">{c.identityFacts.map((fact, i) => {
            const Icon = facts[i]!;
            return <li key={fact}><Icon size={19} aria-hidden="true" />{fact}</li>;
          })}</ul>
          <Link href={href("/register")} className="park-primary">{c.identityCta}<Arrow size={18} aria-hidden="true" /></Link>
        </div>
      </section>
      <section className="park-how" aria-labelledby="park-how-title">
        <div className="park-section-heading"><p className="park-eyebrow">{c.howEyebrow}</p><h2 id="park-how-title">{c.howTitle}</h2></div>
        <ol className="park-steps">{c.steps.map((step,i) => <li key={step.title}>
          <span className="park-step-number" aria-hidden="true">{new Intl.NumberFormat(locale).format(i+1).padStart(locale === "fa" ? 1 : 2, "0")}</span>
          <h3>{step.title}</h3><p>{step.body}</p>
        </li>)}</ol>
      </section>
      <section className="park-story park-moments" aria-labelledby="park-moments-title">
        <div className="park-section-heading"><p className="park-eyebrow">{c.momentsEyebrow}</p><h2 id="park-moments-title">{c.momentsTitle}</h2></div>
        <div className="park-moments__grid">{c.moments.map(moment => <article key={moment.href}>
          <Image unoptimized src={photo(moment.image)} alt="" width={600} height={480} loading="lazy" />
          <h3>{moment.title}</h3><p>{moment.body}</p>
          <Link href={href(moment.href)}>{moment.action}<Arrow size={17} aria-hidden="true" /></Link>
        </article>)}</div>
      </section>
      <section className="park-trust" aria-labelledby="park-trust-title">
        <div className="park-section-heading"><p className="park-eyebrow">{c.trustEyebrow}</p><h2 id="park-trust-title">{c.trustTitle}</h2></div>
        <div className="park-trust__grid">{c.trust.map((point,i) => {
          const Icon = trustIcons[i]!;
          return <article key={point.title}><Icon size={28} strokeWidth={1.6} aria-hidden="true" /><h3>{point.title}</h3><p>{point.body}</p></article>;
        })}</div>
      </section>
      <section className="park-story park-support" aria-labelledby="park-support-title">
        <Image unoptimized src={photo("community")} alt="" width={900} height={680} loading="lazy" />
        <div className="park-story__copy"><p className="park-eyebrow">{c.supportEyebrow}</p><h2 id="park-support-title">{c.supportTitle}</h2><p>{c.supportBody}</p>
          <Link className="park-primary" href={href("/animal-support/needs")}>{c.supportCta}<Arrow size={18} aria-hidden="true" /></Link>
          <Link className="park-text-link" href={href("/community")}>{c.communityCta}<Arrow size={18} aria-hidden="true" /></Link>
        </div>
      </section>
      <section id="park-partners" className="park-partners" aria-labelledby="park-partners-title">
        <p className="park-eyebrow">{c.partnerEyebrow}</p><h2 id="park-partners-title">{c.partnerTitle}</h2><p>{c.partnerBody}</p>
        <div className="park-story__actions">
          <Link href={`${href("/auth")}?returnTo=${encodeURIComponent(href("/provider"))}`} className="park-primary">{c.partnerLogin}<Arrow size={18} aria-hidden="true" /></Link>
          <Link href={`${href("/register")}?returnTo=${encodeURIComponent(href("/provider"))}`} className="park-secondary">{c.partnerJoin}<Arrow size={18} aria-hidden="true" /></Link>
        </div>
      </section>
      <section className="park-final" aria-labelledby="park-final-title"><PawPrint size={34} aria-hidden="true" /><h2 id="park-final-title">{c.finalTitle}</h2><p>{c.finalBody}</p>
        <div className="park-story__actions"><Link className="park-primary" href={href("/register")}>{c.join}<Arrow size={18} aria-hidden="true" /></Link><Link className="park-secondary" href={href("/auth")}>{c.login}<Arrow size={18} aria-hidden="true" /></Link></div>
      </section>
    </main>
    <ParkFooter locale={locale} />
  </div>;
}
