import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { localizeDeepLink } from "../features/notifications/NotificationCenterView";

describe("localizeDeepLink", () => {
  it("prefixes the active locale onto a locale-free link", () => {
    expect(localizeDeepLink("/invitations/abc", "fa")).toBe("/fa/invitations/abc");
    expect(localizeDeepLink("/pets/1?tab=care", "en")).toBe("/en/pets/1?tab=care");
  });
  it("never doubles a locale already in a stored link", () => {
    expect(localizeDeepLink("/fa/invitations/abc", "fa")).toBe("/fa/invitations/abc");
    expect(localizeDeepLink("/en/invitations/abc", "fa")).toBe("/en/invitations/abc");
  });
  it("does not mistake a path that merely starts with the letters of a locale", () => {
    expect(localizeDeepLink("/faq", "fa")).toBe("/fa/faq");
  });
});
