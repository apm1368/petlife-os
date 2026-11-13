"use client";

import { useMemo } from "react";
import { ReelSection } from "@/features/reel/ReelSection";
import { formatLocaleNumber } from "@/lib/i18n/format";
import { useLanding } from "./LandingShell";
import { useOplCopy } from "./opl-copy";
import { buildReelScenes } from "./reel-scenes";
import { Bird } from "./Bird";

export function LandingReel() {
  const { locale } = useLanding();
  const c = useOplCopy();
  const scenes = useMemo(() => buildReelScenes(c, locale), [c, locale]);
  return <ReelSection id="opl-reel" eyebrow={c.reel.eyebrow} title={c.reel.title} lede={c.reel.lede} scenes={scenes} kicks={c.scenes.k} subs={c.scenes.s}
    labels={c.reel} formatNumber={(n) => formatLocaleNumber(n, locale)} decoration={<Bird kind="canary" flip style={{ top: -36, insetInlineEnd: 34 }} />} />;
}
