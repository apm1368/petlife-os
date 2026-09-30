import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { SupportCampaignDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { animalSupportService } from "@/services/animal-support.service";
import { SupportCampaignDetailView } from "./SupportCampaignDetailView";

let sessionStatus: "authenticated" | "unauthenticated" = "unauthenticated";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/en/animal-support/campaigns/campaign-1", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/services/animal-support.service", () => ({
  animalSupportService: { getCampaign: vi.fn(), listCampaignUpdates: vi.fn(), listCampaignDonors: vi.fn(), donate: vi.fn(), paymentEnvironment: vi.fn().mockResolvedValue({ mode: "sandbox", onlinePaymentAvailable: true }) },
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
    expect(screen.getByText("25,000 Toman of 100,000 Toman raised")).toBeTruthy();
  });

  it("prompts an unauthenticated visitor to log in instead of showing the donate form", async () => {
    renderWithIntl(<SupportCampaignDetailView campaignId="campaign-1" />);

    await waitFor(() => expect(screen.getByText(/Sign in to donate/)).toBeTruthy());
    expect(screen.queryByLabelText("Custom amount in Toman")).toBeNull();
  });

  it("takes Toman, shows an honest sandbox review, sends IRR with an idempotency key, and links the receipt", async () => {
    sessionStatus = "authenticated";
    vi.mocked(animalSupportService.donate).mockResolvedValue({ donationIntentId: "intent-1", status: "SUCCEEDED" as never });

    renderWithIntl(<SupportCampaignDetailView campaignId="campaign-1" />);

    fireEvent.change(await screen.findByLabelText("Custom amount in Toman"), { target: { value: "50000" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/sandbox mode: no real money moves/)).toBeTruthy();
    expect(screen.getByText("Anonymous")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pay 50,000 Toman" }));

    await waitFor(() => expect(animalSupportService.donate).toHaveBeenCalledWith("campaign-1", expect.objectContaining({ amountIrr: 500000, showDonorPublicly: false, idempotencyKey: expect.any(String) })));
    expect(await screen.findByRole("link", { name: "View receipt" })).toBeTruthy();
  });

  it("requires a chosen name before showing a donor publicly", async () => {
    sessionStatus = "authenticated";
    renderWithIntl(<SupportCampaignDetailView campaignId="campaign-1" />);
    fireEvent.change(await screen.findByLabelText("Custom amount in Toman"), { target: { value: "50000" } });
    fireEvent.click(screen.getByLabelText("With a name I choose"));
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Sara" } });
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows public donor amounts in Toman with locale digits, never raw rial", async () => {
    vi.mocked(animalSupportService.listCampaignDonors).mockResolvedValue([{ id: "d1", displayName: "Samira", amountIrr: 35_000_000, createdAt: "2026-09-29T00:00:00.000Z" } as never]);
    renderWithIntl(<SupportCampaignDetailView campaignId="campaign-1" />, "en");
    expect(await screen.findByText("3,500,000 Toman")).toBeTruthy();
    expect(screen.queryByText("35,000,000")).toBeNull();
  });
});
