import { describe, expect, it } from "vitest";
import { mergeMessages } from "./merge-messages";

describe("mergeMessages", () => {
  it("overrides translated branches and retains English fallback keys", () => {
    expect(mergeMessages(
      { auth: { register: { title: "Create account", submit: "Create" }, login: "Log in" }, common: { back: "Back" } },
      { auth: { register: { title: "Konto erstellen" } } },
    )).toEqual({
      auth: { register: { title: "Konto erstellen", submit: "Create" }, login: "Log in" },
      common: { back: "Back" },
    });
  });
});
