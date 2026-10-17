import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { accountService, type PrivacyCenterDto } from "@/services/account.service";
import { PrivacyCenterView } from "./PrivacyCenterView";

vi.mock("@/services/account.service", () => ({
  accountService: { privacy: vi.fn(), sharing: vi.fn(), setConsent: vi.fn(), requestExport: vi.fn(), downloadExport: vi.fn(), deletionPreview: vi.fn(), sendDeletionCode: vi.fn(), requestDeletion: vi.fn(), cancelDeletion: vi.fn() },
}));

const privacy = (overrides: Partial<PrivacyCenterDto> = {}): PrivacyCenterDto => ({
  consentVersion: "2026-09-25",
  consents: [
    { kind: "TERMS", required: true, currentVersion: "2026-09-25", granted: true, grantedAt: "2026-09-26T00:00:00.000Z", revokedAt: null, lastRecordedVersion: "2026-09-25" },
    { kind: "PRIVACY", required: true, currentVersion: "2026-09-25", granted: false, grantedAt: null, revokedAt: null, lastRecordedVersion: null },
    { kind: "MARKETING", required: false, currentVersion: "2026-09-25", granted: false, grantedAt: null, revokedAt: null, lastRecordedVersion: null },
  ],
  exports: [{ id: "x1", status: "READY", requestedAt: "2026-09-29T00:00:00.000Z", readyAt: "2026-09-29T00:01:00.000Z", expiresAt: "2026-10-06T00:01:00.000Z", fileSizeBytes: 20480, downloadCount: 0, failureCode: null }],
  exportAvailableDays: 7,
  exportIncludes: ["ACCOUNT", "PETS"],
  deletionRequests: [],
  retention: { policyPublished: false },
  ...overrides,
});

describe("PrivacyCenterView", () => {
  beforeEach(() => {
    vi.mocked(accountService.privacy).mockReset().mockResolvedValue(privacy());
    vi.mocked(accountService.sharing).mockReset().mockResolvedValue({ sharedByYou: [{ grantId: "g1", pet: { id: "p1", name: "Cookie" }, person: "Reza", kind: "TEMPORARY", canViewHealth: true, startsAt: null, expiresAt: null }], sharedWithYou: [] });
    vi.mocked(accountService.setConsent).mockReset().mockResolvedValue({});
    vi.mocked(accountService.deletionPreview).mockReset();
  });

  it("shows required agreements, a real marketing switch, who can see the pets, and ready exports", async () => {
    renderWithIntl(<PrivacyCenterView />, "en");
    expect(await screen.findByText("Cookie — with Reza")).toBeTruthy();
    expect(screen.getByText(/Temporary access · sees health/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept current version" })).toBeTruthy();
    const toggle = screen.getByRole("switch", { name: "Offers & marketing messages" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    await waitFor(() => expect(accountService.setConsent).toHaveBeenCalledWith("MARKETING", true));
    expect(screen.getByRole("button", { name: "Download" })).toBeTruthy();
    expect(screen.getByText(/20 KB/)).toBeTruthy();
  });

  it("deletion shows the consequences and won't continue while obligations are open", async () => {
    vi.mocked(accountService.deletionPreview).mockResolvedValue({ households: [{ id: "h1", name: "Home", role: "OWNER", otherMembers: 1, pets: 2, membershipStatus: null, onlyOwnerWithOthers: true }], blockers: [{ code: "ONLY_OWNER_OF_SHARED_HOUSEHOLD", count: 1 }], canRequest: false, reauth: { password: false, code: "sa***@example.com" }, retention: { policyPublished: false } });
    renderWithIntl(<PrivacyCenterView />, "en");
    fireEvent.click(await screen.findByRole("button", { name: "Request account deletion" }));
    expect(await screen.findByText(/You're the only owner of a household others share/)).toBeTruthy();
    expect(screen.getByText(/Data-retention rules/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a pending deletion request can be cancelled (Persian)", async () => {
    vi.mocked(accountService.privacy).mockResolvedValue(privacy({ deletionRequests: [{ id: "d1", status: "PENDING", requestedAt: "2026-09-29T00:00:00.000Z", cancelledAt: null, completedAt: null }] }));
    renderWithIntl(<PrivacyCenterView />, "fa");
    expect(await screen.findByRole("button", { name: "لغو درخواست حذف" })).toBeTruthy();
  });
});
