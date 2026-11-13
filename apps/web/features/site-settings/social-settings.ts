import type { PublicPlatformSettings } from "@/services/platform-settings.service";
import type { SocialNetwork } from "./SocialIcons";

/**
 * The social and trust keys X3 adds to /settings/public (claude/admin-social-enamad). Read through this view so the
 * shared PublicPlatformSettings type stays X3's to edit; harmless once those keys are on it.
 */
export type SocialSettings = PublicPlatformSettings & Partial<Record<`social.${SocialNetwork}`, string | null> & Record<`social.${SocialNetwork}Enabled`, boolean>>;
export type TrustSettings = PublicPlatformSettings & { "trust.enamadEnabled"?: boolean; "trust.enamadId"?: string | null; "trust.enamadCode"?: string | null };
