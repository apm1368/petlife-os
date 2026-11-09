import { describe, expect, it } from "vitest";
import de from "./de.json";
import en from "./en.json";
import es from "./es.json";
import fa from "./fa.json";

const keys = [
  "favoritesTitle", "favoritesLoading", "favoritesLoadErrorTitle", "favoritesLoadErrorMessage",
  "favoritesOfflineTitle", "favoritesOfflineMessage", "favoritesAccessDeniedTitle",
  "favoritesAccessDeniedMessage", "favoritesEmptyTitle", "favoritesEmptyDescription",
] as const;

describe("saved travel stays locale coverage", () => {
  it.each([
    ["fa", fa.travelResults], ["en", en.travelResults], ["de", de.travelResults], ["es", es.travelResults],
  ] as const)("defines every page state in %s", (locale, messages) => {
    for (const key of keys) {
      expect(messages[key], `${locale}.travelResults.${key}`).toBeTruthy();
      if (locale === "de" || locale === "es") expect(messages[key]).not.toMatch(/[\u0600-\u06FF]/);
    }
  });
});
