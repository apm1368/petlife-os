import { describe, expect, it } from "vitest";
import fa from "@/messages/fa.json";
import en from "@/messages/en.json";
import de from "@/messages/de.json";
import es from "@/messages/es.json";
import ar from "@/messages/ar.json";
import nl from "@/messages/nl.json";

const keys = ["archiveDraft", "archiveReasonPrompt", "archiveConfirm", "archiveFailed"] as const;
const locales = { fa, en, de, es, ar, nl } as const;
const placeholders = (text: string) => [...text.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort();

describe("admin partner draft archive translations", () => {
  it.each(Object.entries(locales))("includes complete archive copy in %s", (locale, catalog) => {
    const messages = catalog.admin.partners as unknown as Record<string, string>;
    for (const key of keys) {
      expect(messages[key], `${locale}.admin.partners.${key}`).toBeTruthy();
      expect(placeholders(messages[key]!), `${locale}.admin.partners.${key}`).toEqual(placeholders(en.admin.partners[key]));
    }
  });
});
