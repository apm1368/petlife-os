import { describe, expect, it } from "vitest";
import { MedicalDocumentType, DocumentVerificationStatus, DocumentVisibility } from "@petlife/types";
import { documentTypeLabel, documentVerificationLabel, documentVisibilityLabel } from "./document-labels";

describe("document labels", () => {
  it.each(["fa", "en", "de", "es"] as const)("has explicit labels for every document state in %s", (locale) => {
    for (const type of Object.values(MedicalDocumentType)) expect(documentTypeLabel(type, locale)).not.toBe(type);
    for (const visibility of Object.values(DocumentVisibility)) expect(documentVisibilityLabel(visibility, locale)).not.toBe(visibility);
    for (const status of Object.values(DocumentVerificationStatus)) expect(documentVerificationLabel(status, locale)).not.toBe(status);
  });
});
