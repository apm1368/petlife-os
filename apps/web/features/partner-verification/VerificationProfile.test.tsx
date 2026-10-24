import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { partnerVerificationService } from "@/services/partner-verification.service";
import { VerificationProfileForm, VerificationProfileSummary } from "./VerificationProfile";

vi.mock("@/services/partner-verification.service", () => ({ partnerVerificationService: { profile: vi.fn(), saveProfile: vi.fn() } }));
const profile = { firstName: "First", lastName: "Last", landline: "02112345678", websiteUrl: "https://example.com", enamadId: "test-id", mobile: "+989121234567", mobileVerifiedAt: "2026-10-24T00:00:00Z", updatedAt: "2026-10-24T00:00:00Z" };

function SaveAndLockHarness() {
  const [editable, setEditable] = useState(true);
  return <><VerificationProfileForm editable={editable} /><button onClick={() => setEditable(false)}>Lock case</button></>;
}

describe("verification identity profile", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(partnerVerificationService.profile).mockResolvedValue(profile); });
  it("saves editable identity fields without sending a mobile or verification assertion", async () => {
    vi.mocked(partnerVerificationService.saveProfile).mockResolvedValue(profile);
    renderWithIntl(<VerificationProfileForm editable sellerId="seller-1" />);
    fireEvent.change(await screen.findByLabelText("First name"), { target: { value: "Updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save identity details" }));
    await screen.findByText("Identity details saved.");
    expect(partnerVerificationService.saveProfile).toHaveBeenCalledWith({ firstName: "Updated", lastName: "Last", landline: "02112345678", websiteUrl: "https://example.com", enamadId: "test-id" }, "seller-1");
  });
  it("explains the verified-mobile prerequisite instead of claiming a save succeeded", async () => {
    vi.mocked(partnerVerificationService.saveProfile).mockRejectedValue(new ApiError({ code: "VALIDATION_ERROR", message: "Invalid", requestId: "r", details: { reason: "VERIFIED_MOBILE_REQUIRED" } }, 400));
    renderWithIntl(<VerificationProfileForm editable />);
    fireEvent.click(await screen.findByRole("button", { name: "Save identity details" }));
    expect((await screen.findByRole("alert")).textContent).toContain("verify your mobile");
    expect(screen.queryByText("Identity details saved.")).toBeNull();
  });
  it("does not render editable fields for a locked case", async () => {
    renderWithIntl(<VerificationProfileForm editable={false} />);
    await screen.findByText("+989121234567");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save identity details" })).toBeNull();
  });

  it("retains the just-saved server profile when the case becomes locked", async () => {
    vi.mocked(partnerVerificationService.profile).mockResolvedValue(null);
    vi.mocked(partnerVerificationService.saveProfile).mockResolvedValue(profile);
    renderWithIntl(<SaveAndLockHarness />);
    fireEvent.change(await screen.findByLabelText("First name"), { target: { value: "First" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Last" } });
    fireEvent.change(screen.getByLabelText("Landline"), { target: { value: "02112345678" } });
    fireEvent.click(screen.getByRole("button", { name: "Save identity details" }));
    await screen.findByText("Identity details saved.");
    fireEvent.click(screen.getByRole("button", { name: "Lock case" }));
    expect(await screen.findByText("+989121234567")).toBeTruthy();
  });
  it("lets the reviewer read every profile field without fetching the applicant website", () => {
    renderWithIntl(<VerificationProfileSummary profile={profile} />);
    for (const value of ["First", "Last", "02112345678", "https://example.com", "test-id", "+989121234567"]) expect(screen.getByText(value)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("does not replace a failed read with an empty editable profile", async () => {
    vi.mocked(partnerVerificationService.profile).mockRejectedValue(new Error("offline"));
    renderWithIntl(<VerificationProfileForm editable />);
    await screen.findByRole("alert");
    expect(screen.queryByRole("textbox")).toBeNull();
    vi.mocked(partnerVerificationService.profile).mockResolvedValue(profile);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByLabelText("First name")).toBeTruthy());
  });
});
