import { classifyIdentifier } from "./identifier.util";

describe("classifyIdentifier", () => {
  it("classifies an email and lowercases it", () => {
    expect(classifyIdentifier("Sarah@Example.com")).toEqual({ kind: "email", value: "sarah@example.com" });
  });

  it("classifies a phone number and strips spaces/dashes", () => {
    expect(classifyIdentifier("+1 555-0100")).toEqual({ kind: "phone", value: "+15550100" });
  });
});
