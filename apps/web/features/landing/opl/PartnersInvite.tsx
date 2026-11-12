import Link from "next/link";
import { HandHeart, HeartPulse, ShoppingBag, Sparkles } from "@petlife/ui";
import type { RouteLocale } from "@/lib/i18n/config";
import { useOplCopy } from "./opl-copy";
import { storyCopy } from "../story-copy";
import { Bird } from "./Bird";

const ROLE_ICONS = [HeartPulse, Sparkles, ShoppingBag, HandHeart];

/** Invitation to the four partner roles that already have a real workspace. */
export function PartnersInvite({ locale }: { locale: RouteLocale }) {
  const s = storyCopy[locale], c = useOplCopy();
  const provider = encodeURIComponent(`/${locale}/provider`);
  return <section id="park-partners" className="opl-sec opl-partners" aria-labelledby="park-partners-title">
    <div className="opl-wrap">
      <header className="opl-head">
        <p className="opl-eyebrow"><Sparkles size={18} aria-hidden="true" />{s.partnerEyebrow}</p>
        <h2 className="opl-h2" id="park-partners-title">{s.partnerTitle}</h2>
      </header>
      <div className="opl-roles">{c.partners.roles.map((role, i) => {
        const Icon = ROLE_ICONS[i]!;
        return <article key={role.title} className="opl-role"><span className="opl-role__ic"><Icon size={26} aria-hidden="true" /></span><h3>{role.title}</h3><p>{role.body}</p></article>;
      })}</div>
      <div className="opl-partners__cta">
        <Bird kind="budgie" flip style={{ top: -40, insetInlineStart: "30%" }} />
        <p>{s.partnerBody}</p>
        <div className="opl-actions">
          <Link className="opl-btn primary" href={`/${locale}/register?returnTo=${provider}`}>{s.partnerJoin}</Link>
          <Link className="opl-btn line" href={`/${locale}/auth?returnTo=${provider}`}>{s.partnerLogin}</Link>
        </div>
      </div>
    </div>
  </section>;
}
