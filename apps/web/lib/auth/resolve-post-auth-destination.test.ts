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

  it("sends a partner who is not a pet owner to the business home, never to pet-owner onboarding", () => {
    const business = { hasBusiness: true, hasHousehold: false };
    expect(resolvePostAuthDestination("fa", null, { status: "IN_PROGRESS", chapter: "PET_IDENTITY" }, { business })).toBe("/fa/business");
    expect(resolvePostAuthDestination("en", "/en/provider/bookings", { status: "IN_PROGRESS", chapter: "PET_IDENTITY" }, { business })).toBe("/en/provider/bookings");
    expect(resolvePostAuthDestination("en", "https://evil.example", { status: "COMPLETED", chapter: "READY" }, { business })).toBe("/en/business");
  });

  it("sends a partner signup to the partner wizard until it is submitted, then to the business home — never to pet-owner onboarding", () => {
    const inProgress = { status: "IN_PROGRESS", chapter: "ACCOUNT", signupIntent: "PARTNER", partnerStage: "IN_PROGRESS" };
    expect(resolvePostAuthDestination("fa", null, inProgress)).toBe("/fa/partners/join");
    expect(resolvePostAuthDestination("fa", "https://evil.example", inProgress)).toBe("/fa/partners/join");
    expect(resolvePostAuthDestination("fa", null, { ...inProgress, partnerStage: "SUBMITTED" })).toBe("/fa/business");
    // Anyone signing in on the way into the partner area continues there, not into the pet-owner onboarding.
    expect(resolvePostAuthDestination("en", "/en/partners/join", { status: "IN_PROGRESS", chapter: "ACCOUNT" })).toBe("/en/partners/join");
  });

  it("keeps the pet-owner home for a pet owner who is also a partner", () => {
    expect(resolvePostAuthDestination("en", null, { status: "COMPLETED", chapter: "READY" }, { business: { hasBusiness: true, hasHousehold: true } })).toBe("/en/home");
    expect(resolvePostAuthDestination("en", null, { status: "COMPLETED", chapter: "READY" }, { business: null })).toBe("/en/home");
  });

  it("never puts pet-owner onboarding between someone and the console they were sent back to", () => {
    const incomplete = { status: "IN_PROGRESS", chapter: "WELCOME" };
    expect(resolvePostAuthDestination("fa", "/fa/admin/tasks", incomplete)).toBe("/fa/admin/tasks");
    expect(resolvePostAuthDestination("en", "/en/provider/bookings", incomplete)).toBe("/en/provider/bookings");
    expect(resolvePostAuthDestination("en", "/en/administrator-fake", incomplete)).toBe("/en/onboarding?returnTo=%2Fen%2Fadministrator-fake");
  });

  it("lands an admin with nowhere particular to go in admin, onboarding finished or not", () => {
    expect(resolvePostAuthDestination("fa", null, { status: "IN_PROGRESS", chapter: "WELCOME" }, { isAdmin: true })).toBe("/fa/admin");
    expect(resolvePostAuthDestination("fa", null, { status: "COMPLETED", chapter: "READY" }, { isAdmin: true })).toBe("/fa/admin");
    expect(resolvePostAuthDestination("fa", "https://evil.example", { status: "COMPLETED", chapter: "READY" }, { isAdmin: true })).toBe("/fa/admin");
    // An admin who was on their way to a member page still gets there (through onboarding if unfinished).
    expect(resolvePostAuthDestination("fa", "/fa/pets", { status: "COMPLETED", chapter: "READY" }, { isAdmin: true })).toBe("/fa/pets");
  });
});

