import { DEFAULT_COUNTRY_CODE } from "../../common/country/country-config";
import type { PrismaService } from "../../common/prisma/prisma.service";

/** Every plan-pricing/availability lookup resolves country from the household's own `countryCode` (spec: "reuse CountryConfig... plan availability should support country-specific behavior"), falling back to the one real country this project has today — never a client-supplied value (spec: "no client-controlled pricing"). */
export async function resolveHouseholdCountry(prisma: PrismaService, householdId: string): Promise<string> {
  const household = await prisma.household.findUnique({ where: { id: householdId }, select: { countryCode: true } });
  return household?.countryCode ?? DEFAULT_COUNTRY_CODE;
}
