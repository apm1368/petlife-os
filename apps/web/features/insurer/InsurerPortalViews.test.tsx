import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { insurerPortalService } from "@/services/travel-marketplace.service";
import { InsurerApplicationView, InsurerHomeView } from "./InsurerPortalViews";

vi.mock("@/services/travel-marketplace.service", () => ({ insurerPortalService: { me: vi.fn(), applications: vi.fn(), products: vi.fn(), team: vi.fn(), application: vi.fn(), decide: vi.fn() } }));

describe("insurer portal", () => {
  it("tells non-members they have no insurer access", async () => {
    vi.mocked(insurerPortalService.me).mockRejectedValue(new ApiError({ code: "INSURER_ACCESS_DENIED", message: "x", requestId: "r" }, 403));
    renderWithIntl(<InsurerHomeView />, "en");
    expect(await screen.findByText("You are not a member of an insurer on PET LIFE")).toBeTruthy();
  });

  it("cannot approve before review starts, and needs a message to ask for information", async () => {
    vi.mocked(insurerPortalService.application).mockResolvedValue({ id: "a1", productName: "Dog Care", status: "SUBMITTED", eligibilityStatus: "ELIGIBLE", petSpecies: "DOG", petAgeMonths: 30, petBreed: null, submittedAt: "2026-09-01T00:00:00.000Z", updatedAt: "", notes: null, insurerMessage: null, externalReference: null, consentAt: "2026-09-01T00:00:00.000Z", timeline: [] } as never);
    renderWithIntl(<InsurerApplicationView applicationId="a1" />, "en");
    expect(await screen.findByRole("button", { name: "Start review" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    const ask = screen.getByRole("button", { name: "Ask for information" }) as HTMLButtonElement;
    expect(ask.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Message to the applicant"), { target: { value: "Please send vet notes" } });
    expect(ask.disabled).toBe(false);
  });
});
