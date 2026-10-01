import { describe, expect, it } from "vitest";
import { careTitle } from "./care-labels";

describe("careTitle", () => {
  it("a reminder derived from the medical record reads as its kind, in the page language", () => {
    const derived = { title: "واکسن / Vaccination", type: "VACCINATION", source: "MEDICAL_RECORD_DERIVED" };
    expect(careTitle(derived, "fa")).toBe("واکسن");
    expect(careTitle(derived, "en")).toBe("Vaccination");
  });
  it("a title the owner wrote is shown exactly as written", () => {
    expect(careTitle({ title: "یادآور واکسن سالانه", type: "VACCINATION", source: "USER_CREATED" }, "en")).toBe("یادآور واکسن سالانه");
  });
});
