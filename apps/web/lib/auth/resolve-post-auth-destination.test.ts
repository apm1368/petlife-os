import { describe, expect, it } from "vitest";
import { resolvePostAuthDestination } from "./resolve-post-auth-destination";

describe("resolvePostAuthDestination", () => {
  it("sends an incomplete-onboarding user to onboarding, ignoring returnTo", () => {
    const dest = resolvePostAuthDestination("en", "/en/vet/abc/book", { status: "IN_PROGRESS", chapter: "PET_IDENTITY" });
    expect(dest).toBe("/en/onboarding?returnTo=%2Fen%2Fvet%2Fabc%2Fbook");
  });

  it("sends an incomplete-onboarding user to a bare onboarding path when there is no returnTo", () => {
    const dest = resolvePostAuthDestination("en", null, { status: "IN_PROGRESS", chapter: "PET_IDENTITY" });
    expect(dest).toBe("/en/onboarding");
  });

  it("sends a completed-onboarding user to their sanitized returnTo", () => {
    const dest = resolvePostAuthDestination("en", "/en/vet/abc/book", { status: "COMPLETED", chapter: "READY" });
    expect(dest).toBe("/en/vet/abc/book");
  });

  it("sends a completed-onboarding user with no returnTo to home", () => {
    const dest = resolvePostAuthDestination("en", null, { status: "COMPLETED", chapter: "READY" });
    expect(dest).toBe("/en/home");
  });

  it("never carries a malicious returnTo through to the onboarding query param", () => {
    const dest = resolvePostAuthDestination("en", "https://evil.example", { status: "IN_PROGRESS", chapter: "PET_IDENTITY" });
    expect(dest).toBe("/en/onboarding");
  });

  it("never redirects a completed-onboarding user to a malicious returnTo", () => {
    const dest = resolvePostAuthDestination("en", "https://evil.example", { status: "COMPLETED", chapter: "READY" });
    expect(dest).toBe("/en/home");
  });
});
