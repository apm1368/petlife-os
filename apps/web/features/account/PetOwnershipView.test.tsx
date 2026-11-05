import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { petOwnershipService } from "@/services/pet-ownership.service";
import type { PetOwnershipTransferDto } from "@petlife/types";
import { PetOwnershipView } from "./PetOwnershipView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/services/pet-ownership.service", () => ({
  petOwnershipService: {
    listIncoming: vi.fn(),
    listOutgoing: vi.fn(),
    listAll: vi.fn(),
    listMemoryCopies: vi.fn(),
    getOwnership: vi.fn(),
    getTransfer: vi.fn(),
    requestTransfer: vi.fn(),
    acceptTransfer: vi.fn(),
    declineTransfer: vi.fn(),
    cancelTransfer: vi.fn(),
    raiseDispute: vi.fn(),
  },
}));

const transfer = (overrides: Partial<PetOwnershipTransferDto> = {}): PetOwnershipTransferDto =>
  ({
    id: "t1",
    petId: "p1",
    petName: "Cookie",
    fromUserId: "u-owner",
    fromDisplayName: "Sara",
    toUserId: "u-family",
    toDisplayName: "Reza",
    fromHouseholdId: "h1",
    toHouseholdId: "h2",
    status: "PENDING_REVIEW",
    memoryDisposition: "RETAIN",
    note: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    respondedAt: null,
    appliedAt: null,
    expiresAt: "2026-02-08T00:00:00.000Z",
    ...overrides,
  }) as PetOwnershipTransferDto;

describe("PetOwnershipView", () => {
  beforeEach(() => {
    vi.mocked(petOwnershipService.listIncoming).mockReset().mockResolvedValue([transfer()]);
    vi.mocked(petOwnershipService.listOutgoing).mockReset().mockResolvedValue([]);
    vi.mocked(petOwnershipService.listMemoryCopies).mockReset().mockResolvedValue([]);
    vi.mocked(petOwnershipService.acceptTransfer).mockReset().mockResolvedValue({
      transfer: transfer({ status: "ACCEPTED" }),
      ownership: { petId: "p1", ownerUserId: "u-family", ownerDisplayName: "Reza", householdId: "h2", transferredAt: "2026-02-01T00:00:00.000Z" },
      householdId: "h2",
      movedBookings: 2,
      movedReminders: 3,
      movedHealthRecords: true,
      memoryDisposition: "RETAIN",
      movedMemories: 0,
      retainedExpenses: 1,
      subscriptionPayerChanged: true,
      subscriptionSuspended: true,
    });
    vi.mocked(petOwnershipService.declineTransfer).mockReset().mockResolvedValue(transfer({ status: "DECLINED" }));
    vi.mocked(petOwnershipService.raiseDispute).mockReset().mockResolvedValue(transfer({ status: "DISPUTED" }));
  });

  it("shows an incoming request with the pet and both parties", async () => {
    renderWithIntl(<PetOwnershipView />, "en");
    await screen.findByText("Cookie");
    expect(screen.getByText(/Sara/)).toBeTruthy();
    expect(screen.getByText(/Reza/)).toBeTruthy();
    expect(screen.getByText("Waiting for the other party")).toBeTruthy();
  });

  it("states what happens before the transfer is approved", async () => {
    renderWithIntl(<PetOwnershipView />, "en");
    await screen.findByText("Cookie");

    fireEvent.click(screen.getByRole("button", { name: "Approve transfer" }));
    // The confirmation names the health record, the memories and the costs, because
    // getting this wrong costs the owner the pet's history.
    expect(await screen.findByText(/health record comes with it/i)).toBeTruthy();
    expect(screen.getByText(/Recorded costs stay with the previous household/i)).toBeTruthy();
    expect(petOwnershipService.acceptTransfer).not.toHaveBeenCalled();
  });

  it("accepts a transfer only after the confirmation", async () => {
    renderWithIntl(<PetOwnershipView />, "en");
    await screen.findByText("Cookie");

    fireEvent.click(screen.getByRole("button", { name: "Approve transfer" }));
    fireEvent.click(await screen.findByRole("button", { name: "I approve" }));

    await waitFor(() => expect(petOwnershipService.acceptTransfer).toHaveBeenCalledWith("t1"));
    expect(await screen.findByText(/was transferred/i)).toBeTruthy();
  });

  it("declines a transfer and says the owner stays unchanged", async () => {
    renderWithIntl(<PetOwnershipView />, "en");
    await screen.findByText("Cookie");

    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    fireEvent.click(await screen.findByRole("button", { name: "I decline" }));

    await waitFor(() => expect(petOwnershipService.declineTransfer).toHaveBeenCalled());
    expect(await screen.findByText(/registered owner remains unchanged/i)).toBeTruthy();
  });

  it("records a dispute without moving the pet", async () => {
    renderWithIntl(<PetOwnershipView />, "en");
    await screen.findByText("Cookie");

    fireEvent.click(screen.getByRole("button", { name: "Report a dispute" }));
    fireEvent.click(await screen.findByRole("button", { name: "Record it" }));

    await waitFor(() => expect(petOwnershipService.raiseDispute).toHaveBeenCalled());
    expect(await screen.findByText(/registered owner does not change/i)).toBeTruthy();
  });

  it("shows the empty state when there is no request", async () => {
    vi.mocked(petOwnershipService.listIncoming).mockResolvedValue([]);
    renderWithIntl(<PetOwnershipView />, "en");
    expect(await screen.findByText("No requests")).toBeTruthy();
  });

  it("offers the proposer a withdrawal but not an approval", async () => {
    vi.mocked(petOwnershipService.listOutgoing).mockResolvedValue([transfer({ id: "t2", fromUserId: "u-family", toUserId: "u-owner" })]);
    vi.mocked(petOwnershipService.cancelTransfer).mockReset().mockResolvedValue(transfer({ id: "t2", status: "CANCELLED" }));
    renderWithIntl(<PetOwnershipView />, "en");
    await screen.findByText("Cookie");
    fireEvent.click(screen.getByRole("tab", { name: /Outgoing/ }));

    // The proposer proposed it; the API refuses them an approval, so the UI must
    // not offer one. What they may do is withdraw.
    expect(screen.queryByRole("button", { name: "Approve transfer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Decline" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw request" }));

    await waitFor(() => expect(petOwnershipService.cancelTransfer).toHaveBeenCalledWith("t2"));
    expect(await screen.findByText(/Your request was withdrawn/i)).toBeTruthy();
  });

  it("lists the read-only memory copies a separated member kept", async () => {
    vi.mocked(petOwnershipService.listMemoryCopies).mockResolvedValue([
      {
        copyId: "c1",
        memoryId: "m1",
        petId: "p1",
        petName: "Cookie",
        householdId: "h1",
        createdAt: "2026-02-01T00:00:00.000Z",
        memory: { id: "m1", type: "STORY", title: "First walk", description: null, occurredAt: "2026-01-20T00:00:00.000Z", mediaObjectKeys: [], tags: [] },
      },
    ]);
    renderWithIntl(<PetOwnershipView />, "en");
    fireEvent.click(screen.getByRole("tab", { name: /My memories/ }));
    expect(await screen.findByText("First walk")).toBeTruthy();
    expect(screen.getByText("Read-only")).toBeTruthy();
  });

  it("renders in Persian", async () => {
    renderWithIntl(<PetOwnershipView />, "fa");
    await screen.findByText("Cookie");
    expect(screen.getByText("در انتظار پاسخ طرف دیگر")).toBeTruthy();
  });
});
