import type { TravelSourceAdapter } from "./travel-source-adapter";
import { AlibabaPublicWebAdapter } from "./alibaba.adapter";
import { JabamaPublicWebAdapter } from "./jabama.adapter";
import { FixtureAdapter } from "./fixture.adapter";

export const TRAVEL_SOURCE_ADAPTERS = Symbol("TRAVEL_SOURCE_ADAPTERS");

/** Real adapters by source code, one per source. FIXTURE exists only under NODE_ENV=test (synthetic contract tests). */
export function buildAdapterRegistry(): Map<string, TravelSourceAdapter> {
  const m = new Map<string, TravelSourceAdapter>([
    ["JABAMA", new JabamaPublicWebAdapter()],
    ["ALIBABA", new AlibabaPublicWebAdapter()],
  ]);
  if (process.env.NODE_ENV === "test") m.set("FIXTURE", new FixtureAdapter());
  return m;
}
