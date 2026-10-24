import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { householdsService } from "@/services/households.service";
import { HouseholdInvitationView } from "./HouseholdInvitationView";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("@/services/households.service", () => ({ householdsService: { inspectInvitation: vi.fn(), acceptInvitation: vi.fn(), declineInvitation: vi.fn() } }));
const err = (status: number, code: string) => new ApiError({ code, message: "raw backend text", requestId: "r" }, status);

describe("HouseholdInvitationView", () => {
  beforeEach(() => {
    replace.mockReset();
    vi.mocked(householdsService.inspectInvitation).mockReset();
    vi.mocked(householdsService.acceptInvitation).mockReset();
  });

  it("an expired invitation explains itself without showing the household", async () => {
    vi.mocked(householdsService.inspectInvitation).mockRejectedValue(err(410, "INVITATION_EXPIRED"));
    renderWithIntl(<HouseholdInvitationView token="t" />, "en");
    expect(await screen.findByRole("heading", { name: "This invitation has expired" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("raw backend text");
  });

  it("someone else's invitation reveals nothing about it (Persian)", async () => {
    vi.mocked(householdsService.inspectInvitation).mockRejectedValue(err(403, "INVITATION_NOT_FOR_YOU"));
    renderWithIntl(<HouseholdInvitationView token="t" />, "fa");
    expect(await screen.findByRole("heading", { name: "این دعوت برای حساب دیگری است" })).toBeTruthy();
  });

  it("an accept failure is shown, not swallowed; success goes to the household", async () => {
    vi.mocked(householdsService.inspectInvitation).mockResolvedValue({ household: { id: "h1", name: "Rezaei home" }, inviter: { displayName: "Sara" }, expiresAt: "2026-10-05T10:00:00.000Z", initialAccess: [] });
    vi.mocked(householdsService.acceptInvitation).mockRejectedValueOnce(err(409, "INVITATION_ALREADY_USED")).mockResolvedValueOnce({ householdId: "h1" });
    renderWithIntl(<HouseholdInvitationView token="t" />, "en");
    fireEvent.click(await screen.findByRole("button", { name: "Accept invitation" }));
    expect(await screen.findByRole("heading", { name: "This invitation was already answered" })).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("accepting a live invitation lands on the household page", async () => {
    vi.mocked(householdsService.inspectInvitation).mockResolvedValue({ household: { id: "h1", name: "Rezaei home" }, inviter: { displayName: "Sara" }, expiresAt: "2026-10-05T10:00:00.000Z", initialAccess: [] });
    vi.mocked(householdsService.acceptInvitation).mockResolvedValue({ householdId: "h1" });
    renderWithIntl(<HouseholdInvitationView token="t" />, "en");
    expect(await screen.findByText("Sara invited you to Rezaei home")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/profile/household"));
  });
});
