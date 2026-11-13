import type { RouteLocale } from "@/lib/i18n/config";
import { ParkHeader } from "./ParkHeader";
import { ParkHero } from "./ParkHero";
import { ParkFooter } from "./ParkFooter";
import { storyCopy } from "./story-copy";
import { PublicPetMemorialSection } from "./PublicPetMemorialSection";
import { LandingPublicArticles } from "./LandingPublicArticles";
import { LandingShell } from "./opl/LandingShell";
import { WorldOrbit } from "./opl/WorldOrbit";
import { LandingReel } from "./opl/LandingReel";
import { PathSteps } from "./opl/PathSteps";
import { TrustShare } from "./opl/TrustShare";
import { LostStrip } from "./opl/LostStrip";
import { KindnessLight } from "./opl/KindnessLight";
import { PartnersInvite } from "./opl/PartnersInvite";
import { FinalStart } from "./opl/FinalStart";
import { SetPetLandingSection } from "@/features/set-pet/SetPetLandingSection";

/** The landing (docs/design/pattern-2026-11): the approved hero unchanged, then the five questions, reel, steps,
 *  trust, lost-pet help, the memorial, kindness, articles, partners and the closing call. */
export function HomeLanding({ locale }: { locale: RouteLocale }) {
  const c = storyCopy[locale];
  return <div className="park-landing">
    <LandingShell locale={locale}>
      <ParkHeader locale={locale} />
      <main id="lp-main" tabIndex={-1}>
        <ParkHero locale={locale} />
        <SetPetLandingSection />
        <WorldOrbit />
        <LandingReel />
        <PathSteps />
        <TrustShare />
        <LostStrip />
        <PublicPetMemorialSection />
        <KindnessLight />
        <LandingPublicArticles locale={locale} copy={c.publicArticles} />
        <PartnersInvite locale={locale} />
        <FinalStart />
      </main>
      <ParkFooter locale={locale} />
    </LandingShell>
  </div>;
}
