import { DISPUTE_NEXT, SUPPORT_CASE_NEXT, TRUST_CASE_NEXT } from "@petlife/types";
import { DISPUTE_TRANSITIONS } from "../dispute/dispute-transitions";
import { SUPPORT_CASE_TRANSITIONS } from "../support/support-case-transitions";
import { TRUST_CASE_TRANSITIONS } from "./trust-case-transitions";

/** The admin UI offers only the moves in @petlife/types; they must never drift from the API's authoritative tables. */
describe("case transition tables shared with the admin UI", () => {
  const normalize = (table: Record<string, readonly string[]>) =>
    Object.fromEntries(Object.entries(table).map(([from, to]) => [from, [...to].sort()]));

  it.each([
    ["trust", TRUST_CASE_TRANSITIONS, TRUST_CASE_NEXT],
    ["dispute", DISPUTE_TRANSITIONS, DISPUTE_NEXT],
    ["support", SUPPORT_CASE_TRANSITIONS, SUPPORT_CASE_NEXT],
  ] as const)("%s matches", (_name, api, shared) => {
    expect(normalize(shared as Record<string, readonly string[]>)).toEqual(normalize(api as Record<string, readonly string[]>));
  });
});
