import { normalizeIranianPhone, type NormalizedPhone } from "../phone/phone-normalizer";

/**
 * The first CountryConfig in this codebase (Handoff 10 spec: "do not
 * hardcode all messaging policy into Iran-specific services... H10 is
 * Iran-first but globally extensible"). Deliberately minimal — a plain
 * lookup keyed by ISO country code, not a database-backed settings system —
 * since exactly one country is real today. A future handoff adding a second
 * country extends `COUNTRY_CONFIGS` and `normalizePhone`'s dispatch, never
 * the shape callers depend on.
 */
export interface CountryConfig {
  countryCode: string;
  /** Whether SMS delivery is offered at all for a recipient normalized to this country. */
  smsAvailable: boolean;
  /** Default consent posture for MARKETING-category notifications — explicit opt-in only, never inferred from transactional consent (spec). */
  marketingDefaultEnabled: boolean;
  defaultTimezone: string;
  normalizePhone: (input: string) => NormalizedPhone | null;
}

const IRAN_CONFIG: CountryConfig = {
  countryCode: "IR",
  smsAvailable: true,
  marketingDefaultEnabled: false,
  defaultTimezone: "Asia/Tehran",
  normalizePhone: normalizeIranianPhone,
};

const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  IR: IRAN_CONFIG,
};

export const DEFAULT_COUNTRY_CODE = "IR";

export function getCountryConfig(countryCode: string = DEFAULT_COUNTRY_CODE): CountryConfig {
  return COUNTRY_CONFIGS[countryCode] ?? IRAN_CONFIG;
}
