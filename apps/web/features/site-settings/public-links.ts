import type { PublicPlatformSettings } from "@/services/platform-settings.service";

/** Footer order. The API only accepts (and only publishes) each network's own https hosts. */
export const SOCIAL_NETWORKS = ["instagram", "telegram", "whatsapp", "bale", "x", "linkedin", "youtube", "aparat"] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

/** The social links to show: a link is set and its own switch isn't off (owner, 2026-11-13). */
export function visibleSocialLinks(settings: PublicPlatformSettings | null): { network: SocialNetwork; href: string }[] {
  if (!settings) return [];
  return SOCIAL_NETWORKS.flatMap((network) => {
    const href = settings[`social.${network}`];
    return typeof href === "string" && href && settings[`social.${network}Enabled`] !== false ? [{ network, href }] : [];
  });
}

const ENAMAD_ID = /^\d{3,12}$/;
const ENAMAD_CODE = /^[A-Za-z0-9]{6,64}$/;

/**
 * The eNamad trust seal, built only from the stored id and code: the standard link and image on trustseal.enamad.ir,
 * never pasted HTML. Null until the seal is switched on and both values are valid, so nothing renders before then.
 * Render as <a href={href} target="_blank" referrerPolicy="origin"><img src={imageSrc} referrerPolicy="origin" alt="…" /></a>.
 */
export function enamadSeal(settings: Pick<PublicPlatformSettings, "trust.enamadEnabled" | "trust.enamadId" | "trust.enamadCode"> | null): { href: string; imageSrc: string } | null {
  if (!settings || settings["trust.enamadEnabled"] !== true) return null;
  const id = settings["trust.enamadId"], code = settings["trust.enamadCode"];
  if (!id || !code || !ENAMAD_ID.test(id) || !ENAMAD_CODE.test(code)) return null;
  const query = new URLSearchParams({ id, Code: code }).toString();
  return { href: `https://trustseal.enamad.ir/?${query}`, imageSrc: `https://trustseal.enamad.ir/logo.aspx?${query}` };
}
