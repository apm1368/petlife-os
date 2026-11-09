import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { householdsService } from "@/services/households.service";
import { HouseholdInvitationView } from "./HouseholdInvitationView";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("@/services/households.service", () => ({ householdsService: { inspectInvitation: vi.fn(), requestMembership: vi.fn(), declineInvitation: vi.fn() } }));
const err = (status: number, code: string) => new ApiError({ code, message: "raw backend text", requestId: "r" }, status);

describe("HouseholdInvitationView", () => {
  beforeEach(() => {
    replace.mockReset();
    vi.mocked(householdsService.inspectInvitation).mockReset();
    vi.mocked(householdsService.requestMembership).mockReset();
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

  it("a request failure is shown, not swallowed", async () => {
    vi.mocked(householdsService.inspectInvitation).mockResolvedValue({ contactMasked: "+98912***34", phoneVerified: false, expiresAt: "2026-10-05T10:00:00.000Z", requestPending: false });
    vi.mocked(householdsService.requestMembership).mockRejectedValueOnce(err(409, "INVITATION_ALREADY_USED"));
    renderWithIntl(<HouseholdInvitationView token="t" />, "en");
    fireEvent.click(await screen.findByRole("button", { name: "Request membership" }));
    expect(await screen.findByRole("heading", { name: "This invitation was already answered" })).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("a verified number still needs explicit owner approval", async () => {
    vi.mocked(householdsService.inspectInvitation).mockResolvedValue({ contactMasked: "+98912***34", phoneVerified: true, expiresAt: "2026-10-05T10:00:00.000Z", requestPending: false });
    vi.mocked(householdsService.requestMembership).mockResolvedValue({ householdId: "h1", invitationId: "i1", status: "REQUESTED", alreadyRequested: false });
    renderWithIntl(<HouseholdInvitationView token="t" />, "en");
    fireEvent.click(await screen.findByRole("button", { name: "Request membership" }));
    expect((await screen.findByRole("status")).textContent).toContain("Your request was submitted");
    expect(screen.getByText(/membership and pet access still begin only after the owner approves/)).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("renders the unverified-number request flow entirely in German", async () => {
    vi.mocked(householdsService.inspectInvitation).mockResolvedValue({ contactMasked: "+98912***34", phoneVerified: false, expiresAt: "2026-10-05T10:00:00.000Z", requestPending: false });
    renderWithIntl(<HouseholdInvitationView token="t" />, "de");

    expect(await screen.findByRole("heading", { name: "Einem Haushalt beitreten" })).toBeTruthy();
    expect(screen.getByText(/nicht bestätigt/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mitgliedschaft anfragen" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]/);
  });

  it("renders the pending owner-approval state and expired-link recovery in Spanish", async () => {
    vi.mocked(householdsService.inspectInvitation).mockResolvedValue({ contactMasked: "+98912***34", phoneVerified: true, expiresAt: "2026-10-05T10:00:00.000Z", requestPending: true });
    const { unmount } = renderWithIntl(<HouseholdInvitationView token="t" />, "es");
    expect(await screen.findByRole("heading", { name: "Tu solicitud está pendiente de la aprobación de la persona responsable del hogar" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Tu solicitud se ha enviado");
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]/);

    unmount();
    vi.mocked(householdsService.inspectInvitation).mockRejectedValue(err(410, "INVITATION_EXPIRED"));
    renderWithIntl(<HouseholdInvitationView token="t" />, "es");
    expect(await screen.findByRole("heading", { name: "Esta invitación ha caducado" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ir a tu cuenta" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]/);
  });
});
