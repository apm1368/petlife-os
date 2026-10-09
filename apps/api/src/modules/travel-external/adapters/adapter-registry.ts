import type { TravelSourceAdapter } from "./travel-source-adapter";
import { BlockedSourceAdapter } from "./blocked-source.adapter";
import { FixtureAdapter } from "./fixture.adapter";

export const TRAVEL_SOURCE_ADAPTERS = Symbol("TRAVEL_SOURCE_ADAPTERS");

/** Real adapters by source code. FIXTURE exists only under NODE_ENV=test (contract tests). */
export function buildAdapterRegistry(): Map<string, TravelSourceAdapter> {
  const m = new Map<string, TravelSourceAdapter>([
    ["JABAMA", new BlockedSourceAdapter("JABAMA", "https://www.jabama.com/robots.txt")],
    ["ALIBABA", new BlockedSourceAdapter("ALIBABA", "https://www.alibaba.ir/robots.txt")],
  ]);
  if (process.env.NODE_ENV === "test") m.set("FIXTURE", new FixtureAdapter());
  return m;
}
