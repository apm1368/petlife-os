import { classifyIdentifier } from "./identifier.util";

describe("classifyIdentifier", () => {
  it("classifies an email and lowercases it", () => {
    expect(classifyIdentifier("Sarah@Example.com")).toEqual({ kind: "email", value: "sarah@example.com" });
  });

  it("classifies an Iranian mobile in any spelling as canonical E.164", () => {
    for (const typed of ["0912 123-4567", "+989121234567", "00989121234567", "۰۹۱۲۱۲۳۴۵۶۷"]) {
      expect(classifyIdentifier(typed)).toEqual({ kind: "phone", value: "+989121234567" });
    }
  });

  it("rejects anything that is neither an email nor an Iranian mobile, instead of storing it as typed", () => {
    for (const typed of ["+1 555-0100", "02112345678", "hello"]) expect(() => classifyIdentifier(typed)).toThrow();
  });
});
