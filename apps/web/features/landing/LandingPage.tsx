import Link from "next/link";
import {
  ArrowLeft, ArrowRight, BadgeCheck, BedDouble, CarFront, Check, CircleHelp, Clock3, Footprints, GraduationCap,
  House, Scissors, ShieldCheck, Stethoscope, Fingerprint,
} from "@petlife/ui";
import type { AppLocale } from "@/lib/i18n/config";
import { landingCopy, type ServiceIcon } from "./copy";
import { LandingHeader } from "./LandingHeader";
import { LandingReveal } from "./LandingReveal";
import { CommunityScene, MemoryScene, PetPortrait, TehranScene, TravelScene } from "./scenes";
import "./landing.css";

const SERVICE_ICONS: Record<ServiceIcon, typeof House> = {
  vet: Stethoscope, groom: Scissors, train: GraduationCap, walk: Footprints, sit: House, board: BedDouble, taxi: CarFront,
};
const TONE_ICON = { done: Check, soon: Clock3, unknown: CircleHelp, info: BadgeCheck } as const;

/**
 * Public landing — server-rendered, no domain requests. One illustration language, editorial bands
 * instead of a feature wall, and every action is a link to a shipped route.
 */
export function LandingPage({ locale }: { locale: AppLocale }) {
  const c = landingCopy[locale];
  const href = (path: string) => `/${locale}${path}`;
  const Forward = locale === "fa" ? ArrowLeft : ArrowRight;
  const lines = (text: string) => text.split("\n").map((line, i) => <span key={i} className="lp-line">{line}</span>);

  return (
    <div className="lp">
      <LandingHeader locale={locale} copy={c} />
      <LandingReveal />
      <main id="lp-main" tabIndex={-1}>
        <section className="lp-hero" aria-labelledby="lp-hero-title">
          <div className="lp-wrap lp-hero__copy">
            <h1 id="lp-hero-title" className="lp-display">{lines(c.hero.title)}</h1>
            <p className="lp-lead">{c.hero.body}</p>
            <div className="lp-actions">
              <Link className="lp-btn lp-btn--primary" href={href("/register")}>{c.hero.primary}</Link>
              <Link className="lp-btn lp-btn--secondary" href={href("/services")}>{c.hero.secondary}</Link>
            </div>
            <p className="lp-note">{c.hero.note}</p>
          </div>
          <TehranScene label={c.hero.sceneLabel} className="lp-hero__scene" />
        </section>

        <section className="lp-band" data-reveal aria-labelledby="lp-identity">
          <div className="lp-wrap lp-split">
            <div className="lp-copy">
              <p className="lp-eyebrow">{c.identity.eyebrow}</p>
              <h2 id="lp-identity" className="lp-h2">{c.identity.title}</h2>
              <p className="lp-body">{c.identity.body}</p>
              <div className="lp-actions">
                <Link className="lp-btn lp-btn--primary" href={href("/pets/new")}>{c.identity.cta}</Link>
              </div>
            </div>
            <div className="lp-identity">
              <div className="lp-identity__strip">
                <PetPortrait className="lp-identity__photo" />
                <div className="lp-identity__who">
                  <p className="lp-identity__name">{c.identity.pet.name}</p>
                  <p className="lp-identity__detail">{c.identity.pet.detail}</p>
                </div>
                <span className="lp-sample">{c.identity.sample}</span>
              </div>
              <ul className="lp-identity__facts">
                <li><Fingerprint size={16} aria-hidden="true" />{c.identity.pet.chip}</li>
                <li><ShieldCheck size={16} aria-hidden="true" />{c.identity.pet.vaccines}</li>
                <li data-tone="unknown"><CircleHelp size={16} aria-hidden="true" />{c.identity.pet.allergies}</li>
              </ul>
              <ul className="lp-rows">
                {c.identity.links.map((link) => (
                  <li key={link.href}>
                    <Link href={href(link.href)} className="lp-row">
                      <span className="lp-row__label">{link.label}</span>
                      <span className="lp-row__hint">{link.hint}</span>
                      <Forward size={16} aria-hidden="true" className="lp-row__go" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="lp-band lp-band--sunken" data-reveal aria-labelledby="lp-health">
          <div className="lp-wrap lp-split lp-split--reverse">
            <div className="lp-copy">
              <p className="lp-eyebrow">{c.health.eyebrow}</p>
              <h2 id="lp-health" className="lp-h2">{c.health.title}</h2>
              <p className="lp-body">{c.health.body}</p>
              <div className="lp-actions">
                <Link className="lp-btn lp-btn--primary" href={href("/pets/active?view=health")}>{c.health.primary}</Link>
                <Link className="lp-btn lp-btn--secondary" href={href("/care-calendar")}>{c.health.secondary}</Link>
              </div>
            </div>
            <figure className="lp-timeline">
              <figcaption className="lp-sample">{c.health.sample}</figcaption>
              <ol>
                {c.health.rows.map((row) => {
                  const Icon = TONE_ICON[row.tone];
                  return (
                    <li key={row.label} data-tone={row.tone}>
                      <span className="lp-timeline__dot"><Icon size={14} aria-hidden="true" /></span>
                      <span className="lp-timeline__label">{row.label}</span>
                      <span className="lp-timeline__value">{row.value}</span>
                    </li>
                  );
                })}
              </ol>
            </figure>
          </div>
        </section>

        <section className="lp-band" data-reveal aria-labelledby="lp-services">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <div className="lp-copy">
                <p className="lp-eyebrow">{c.services.eyebrow}</p>
                <h2 id="lp-services" className="lp-h2">{c.services.title}</h2>
                <p className="lp-body">{c.services.body}</p>
              </div>
              <div className="lp-actions">
                <Link className="lp-btn lp-btn--primary" href={href("/services")}>{c.services.primary}</Link>
                <Link className="lp-btn lp-btn--secondary" href={href("/vet/find")}>{c.services.secondary}</Link>
              </div>
            </div>
            <ul className="lp-services">
              {c.services.categories.map((cat) => {
                const Icon = SERVICE_ICONS[cat.icon];
                return (
                  <li key={cat.href}>
                    <Link href={href(cat.href)} className="lp-service">
                      <span className="lp-service__icon"><Icon size={20} aria-hidden="true" /></span>
                      <span className="lp-service__text">
                        <span className="lp-row__label">{cat.label}</span>
                        <span className="lp-row__hint">{cat.hint}</span>
                      </span>
                      <Forward size={16} aria-hidden="true" className="lp-row__go" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="lp-band lp-band--sunken" data-reveal aria-labelledby="lp-travel">
          <div className="lp-wrap lp-split">
            <div className="lp-media">
              <TravelScene label={c.travel.sceneLabel} className="lp-media__scene" />
              <dl className="lp-facts">
                <span className="lp-sample">{c.travel.sample}</span>
                {c.travel.facts.map((fact) => (
                  <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
                ))}
              </dl>
            </div>
            <div className="lp-copy">
              <p className="lp-eyebrow">{c.travel.eyebrow}</p>
              <h2 id="lp-travel" className="lp-h2">{c.travel.title}</h2>
              <p className="lp-body">{c.travel.body}</p>
              <div className="lp-actions">
                <Link className="lp-btn lp-btn--primary" href={href("/travel")}>{c.travel.primary}</Link>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-band" data-reveal aria-labelledby="lp-memories">
          <div className="lp-wrap lp-split lp-split--reverse">
            <div className="lp-copy">
              <p className="lp-eyebrow">{c.memories.eyebrow}</p>
              <h2 id="lp-memories" className="lp-h2">{c.memories.title}</h2>
              <p className="lp-body">{c.memories.body}</p>
              <div className="lp-actions">
                <Link className="lp-btn lp-btn--primary" href={href("/pets/active?view=memories")}>{c.memories.primary}</Link>
              </div>
            </div>
            <MemoryScene label={c.memories.sceneLabel} className="lp-memories__scene" />
          </div>
        </section>

        <section className="lp-band lp-band--sunken" data-reveal aria-labelledby="lp-community">
          <div className="lp-wrap lp-split">
            <CommunityScene label={c.community.sceneLabel} className="lp-community__scene" />
            <div className="lp-copy">
              <p className="lp-eyebrow">{c.community.eyebrow}</p>
              <h2 id="lp-community" className="lp-h2">{c.community.title}</h2>
              <p className="lp-body">{c.community.body}</p>
              <ul className="lp-rows">
                {c.community.links.map((link) => (
                  <li key={link.href}>
                    <Link href={href(link.href)} className="lp-row">
                      <span className="lp-row__label">{link.label}</span>
                      <span className="lp-row__hint">{link.hint}</span>
                      <Forward size={16} aria-hidden="true" className="lp-row__go" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="lp-band lp-band--inverse" data-reveal aria-labelledby="lp-ecosystem">
          <div className="lp-wrap lp-split">
            <div className="lp-copy">
              <p className="lp-eyebrow">{c.ecosystem.eyebrow}</p>
              <h2 id="lp-ecosystem" className="lp-h2">{c.ecosystem.title}</h2>
              <p className="lp-body">{c.ecosystem.body}</p>
              <div className="lp-actions">
                <Link className="lp-btn lp-btn--on-inverse" href={href("/vet/find")}>{c.ecosystem.primary}</Link>
              </div>
            </div>
            <ul className="lp-points">
              {c.ecosystem.points.map((point) => (
                <li key={point}><Check size={18} aria-hidden="true" />{point}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-band" data-reveal aria-labelledby="lp-trust">
          <div className="lp-wrap">
            <p className="lp-eyebrow">{c.trust.eyebrow}</p>
            <h2 id="lp-trust" className="lp-h2">{c.trust.title}</h2>
            <ul className="lp-trust">
              {c.trust.points.map((point, i) => {
                const Icon = [ShieldCheck, Fingerprint, BadgeCheck][i] ?? ShieldCheck;
                return (
                  <li key={point.title}>
                    <Icon size={22} aria-hidden="true" />
                    <h3 className="lp-h3">{point.title}</h3>
                    <p className="lp-body">{point.body}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="lp-final" data-reveal aria-labelledby="lp-final">
          <div className="lp-wrap lp-final__inner">
            <h2 id="lp-final" className="lp-h2 lp-final__title">{c.final.title}</h2>
            <p className="lp-body">{c.final.body}</p>
            <div className="lp-actions lp-actions--center">
              <Link className="lp-btn lp-btn--primary" href={href("/register")}>{c.final.primary}</Link>
              <Link className="lp-btn lp-btn--secondary" href={href("/auth")}>{c.final.secondary}</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer__inner">
          <div className="lp-footer__brand">
            <bdi className="lp-footer__name">PET LIFE OS</bdi>
            <p>{c.footer.tagline}</p>
            <p className="lp-footer__demo">{c.footer.demo}</p>
          </div>
          {c.footer.groups.map((group) => (
            <nav key={group.title} aria-label={group.title} className="lp-footer__group">
              <p className="lp-footer__title">{group.title}</p>
              <ul>
                {group.links.map((link) => (
                  <li key={link.href}><Link href={href(link.href)}>{link.label}</Link></li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </footer>
    </div>
  );
}
