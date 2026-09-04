import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { SupportCampaignDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { animalSupportService } from "@/services/animal-support.service";
import { SupportCampaignDetailView } from "./SupportCampaignDetailView";

let sessionStatus: "authenticated" | "unauthenticated" = "unauthenticated";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/animal-support.service", () => ({
  animalSupportService: { getCampaign: vi.fn(), listCampaignUpdates: vi.fn(), listCampaignDonors: vi.fn(), donate: vi.fn() },
}));
vi.mock("@/stores/session-store", () => ({
  useSessionStore: (selector: (state: { status: string }) => unknown) => selector({ status: sessionStatus }),
}));

function campaign(overrides: Partial<SupportCampaignDto> = {}): SupportCampaignDto {
  return {
    id: "campaign-1",
    organizationId: "org-1",
    organizationName: "Paws Rescue",
    rescueCaseId: null,
    title: "Winter shelter fund",
    description: "Help us keep the shelter warm this winter.",
    fundType: "GENERAL" as never,
    targetAmountIrr: 1_000_000,
    raisedAmountIrr: 250_000,
    status: "ACTIVE" as never,
    createdAt: "2026-01-01T00:00:00.000Z",
    startsAt: null,
    endsAt: null,
    ...overrides,
  };
}

describe("SupportCampaignDetailView", () => {
  beforeEach(() => {
    sessionStatus = "unauthenticated";
    vi.mocked(animalSupportService.getCampaign).mockReset().mockResolvedValue(campaign());
    vi.mocked(animalSupportService.listCampaignUpdates).mockReset().mockResolvedValue([]);
    vi.mocked(animalSupportService.listCampaignDonors).mockReset().mockResolvedValue([]);
    vi.mocked(animalSupportService.donate).mockReset();
  });

  it("shows the campaign's ledger-derived progress, never a locally computed estimate", async () => {
    renderWithIntl(<SupportCampaignDetailView campaignId="campaign-1" />);

    await waitFor(() => expect(screen.getByText("Winter shelter fund")).toBeTruthy());
    expect(screen.getByText("250,000 of 1,000,000 IRR raised")).toBeTruthy();
  });

  it("prompts an unauthenticated visitor to log in instead of showing the donate form", async () => {
    renderWithIntl(<SupportCampaignDetailView campaignId="campaign-1" />);

    await waitFor(() => expect(screen.getByText("Log in to make a donation.")).toBeTruthy());
    expect(screen.queryByLabelText("Amount (IRR)")).toBeNull();
  });

  it("lets an authenticated donor submit a donation", async () => {
    sessionStatus = "authenticated";
    vi.mocked(animalSupportService.donate).mockResolvedValue({ donationIntentId: "intent-1", status: "SUCCEEDED" as never });

    renderWithIntl(<SupportCampaignDetailView campaignId="campaign-1" />);

    await waitFor(() => expect(screen.getByText("Amount (IRR)")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Amount (IRR)"), { target: { value: "50000" } });
    fireEvent.click(screen.getByText("Donate", { selector: "button" }));

    await waitFor(() => expect(animalSupportService.donate).toHaveBeenCalledWith("campaign-1", { amountIrr: 50000, showDonorPublicly: false }));
    await waitFor(() => expect(screen.getByText("Thank you for your donation!")).toBeTruthy());
  });
});
