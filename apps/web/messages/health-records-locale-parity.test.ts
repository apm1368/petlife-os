import { describe, expect, it } from "vitest";
import fa from "./fa.json";
import en from "./en.json";
import de from "./de.json";
import es from "./es.json";

const requiredKeys = [
  "clinical", "problems", "prescriptions", "carePlans", "senior", "planning", "corrections",
  "empty", "failed", "retry", "recordedBy", "sources", "noAccess", "save", "failedSave",
  "saved", "planningHint", "mobility", "cognition", "medicationComplexity", "quality",
  "monitoring", "palliative", "preferences", "aftercare", "unknownStatus",
] as const;

describe("advanced health record messages", () => {
  it.each([["fa", fa.rollout.records], ["en", en.rollout.records], ["de", de.rollout.records], ["es", es.rollout.records]] as const)(
    "has all page and form copy in %s",
    (_locale, messages) => {
      for (const key of requiredKeys) expect(messages).toHaveProperty(key);
      for (const status of ["ACTIVE", "RESOLVED", "HISTORICAL", "SCHEDULED", "COMPLETED"]) {
        expect(messages.statusLabels).toHaveProperty(status);
      }
    },
  );
});
