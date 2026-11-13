import { describe, expect, it } from "vitest";
import { localizedAuthorName } from "./author-name";

describe("localizedAuthorName", () => {
  const desk = "تحریریهٔ اپت‌لایف · opetlife editorial";
  it("shows the Persian half on /fa and the Latin half elsewhere", () => {
    expect(localizedAuthorName(desk, "fa")).toBe("تحریریهٔ اپت‌لایف");
    for (const locale of ["en", "de", "es"]) expect(localizedAuthorName(desk, locale)).toBe("opetlife editorial");
  });
  it("leaves single-language names alone", () => {
    expect(localizedAuthorName("Dr. Sara Ahmadi", "fa")).toBe("Dr. Sara Ahmadi");
    expect(localizedAuthorName("دکتر سارا احمدی", "en")).toBe("دکتر سارا احمدی");
    expect(localizedAuthorName("A · B", "en")).toBe("A · B");
  });
});
