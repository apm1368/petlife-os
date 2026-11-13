import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { AdminSetPetDetailDto, AdminSetPetListDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminSetPetService } from "@/services/admin-set-pet.service";
import { useAdminStore } from "@/stores/admin-store";
import { AdminSetPetDetailView, AdminSetPetQueueView } from "./AdminSetPetViews";

vi.mock("@/services/admin-set-pet.service", () => ({
  adminSetPetService: { list: vi.fn(), get: vi.fn(), quote: vi.fn(), setStatus: vi.fn(), saveNote: vi.fn(), download: vi.fn() },
}));

const LIST: AdminSetPetListDto = {
  items: [{ id: "r1", number: "SP-000042", status: "SUBMITTED", memberName: "Sara", petName: "Pishi", petSpecies: "CAT", humanSizes: ["M", "XXL"], petSize: "S", placements: 2, designs: 2, quoteAmountIrr: null, estimatedReadyAt: null, createdAt: "2026-11-13T09:00:00Z", updatedAt: "2026-11-13T09:00:00Z" }],
  total: 1,
  page: 1,
  pageSize: 30,
  counts: { SUBMITTED: 1, QUOTED: 0, CONFIRMED: 0, IN_PRODUCTION: 0, SHIPPED: 0, CANCELLED: 0 },
};
const file = { id: "f1", mimeType: "image/svg+xml", fileSizeBytes: 2048, originalFilename: "logo.svg", previewable: false, status: "READY" as const, rejectReason: null, uploadedAt: "2026-11-13T09:00:00Z" };
const DETAIL: AdminSetPetDetailDto = {
  id: "r1",
  number: "SP-000042",
  status: "SUBMITTED",
  member: { id: "u1", displayName: "Sara" },
  pet: { id: "p1", name: "Pishi", species: "CAT" },
  human: { colour: "black", sizes: ["M", "XXL"] },
  petGarment: { size: "S", colour: "black", neckCm: 28.5, chestCm: 44, backLengthCm: 35, weightKg: 6.2 },
  notes: null,
  placements: [{ zone: "FRONT_CENTER", designFile: file }],
  designs: [file],
  quote: { amountIrr: null, note: null, estimatedReadyAt: null, quotedAt: null, quotedBy: null },
  shippingNote: null,
  cancelled: null,
  adminNote: null,
  allowedTransitions: ["CANCELLED"],
  canQuote: true,
  timeline: [{ id: "e1", at: "2026-11-13T09:00:00Z", from: null, to: "SUBMITTED", actor: "MEMBER", staffName: null, note: null }],
  createdAt: "2026-11-13T09:00:00Z",
  updatedAt: "2026-11-13T09:00:00Z",
};

function permissions(values: string[]) {
  useAdminStore.setState({ context: { isAdmin: true, adminUserId: "a1", displayName: "Ops", role: "COMMERCE_OPERATIONS", permissions: values } as never, status: "ready" });
}

describe("admin Set Pet views", () => {
  beforeEach(() => {
    vi.mocked(adminSetPetService.list).mockReset();
    vi.mocked(adminSetPetService.get).mockReset();
    vi.mocked(adminSetPetService.quote).mockReset();
    vi.mocked(adminSetPetService.download).mockReset();
    permissions(["commerce.view", "commerce.manage"]);
  });

  it("opens on new requests with counts per status, showing sizes as printed (2XL)", async () => {
    vi.mocked(adminSetPetService.list).mockResolvedValue(LIST);
    renderWithIntl(<AdminSetPetQueueView />);
    await screen.findByRole("link", { name: "SP-000042 · Sara" });
    expect(adminSetPetService.list).toHaveBeenCalledWith({ status: "SUBMITTED", q: undefined, page: 1 });
    expect(screen.getByRole("tab", { name: "New (1)" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText(/Person M، 2XL · pet S/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Shipped/ }));
    await waitFor(() => expect(adminSetPetService.list).toHaveBeenLastCalledWith({ status: "SHIPPED", q: undefined, page: 1 }));
  });

  it("quotes in toman (sent as IRR) and opens a design only after a reason", async () => {
    vi.mocked(adminSetPetService.get).mockResolvedValue(DETAIL);
    vi.mocked(adminSetPetService.quote).mockResolvedValue({ ...DETAIL, status: "QUOTED" });
    vi.mocked(adminSetPetService.download).mockResolvedValue({ fileId: "f1", filename: "logo.svg", downloadUrl: "https://files.example/x", expiresInSeconds: 300 });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderWithIntl(<AdminSetPetDetailView id="r1" />);
    await screen.findByRole("heading", { name: "SP-000042" });
    expect(screen.getByText("Front centre")).toBeTruthy();
    expect(screen.getByText("Pet's back")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Price (toman)"), { target: { value: "2500000" } });
    fireEvent.change(screen.getByLabelText("Ready by"), { target: { value: "2026-11-20" } });
    fireEvent.change(screen.getByLabelText("Note to the member"), { target: { value: "Two shirts and a pet tee" } });
    fireEvent.click(screen.getByRole("button", { name: "Send quote" }));
    await waitFor(() => expect(adminSetPetService.quote).toHaveBeenCalledWith("r1", { amountIrr: 25_000_000, estimatedReadyAt: "2026-11-20T12:00:00.000Z", note: "Two shirts and a pet tee" }));

    fireEvent.click(screen.getByRole("button", { name: "Open design" }));
    fireEvent.change(screen.getByLabelText("Why are you opening this design?"), { target: { value: "Check resolution" } });
    fireEvent.click(screen.getByRole("button", { name: "Open (recorded)" }));
    await waitFor(() => expect(adminSetPetService.download).toHaveBeenCalledWith("f1", "Check resolution"));
    expect(open).toHaveBeenCalledWith("https://files.example/x", "_blank", "noopener,noreferrer");
  });

  it("shows no quote or status actions to read-only staff", async () => {
    permissions(["commerce.view"]);
    vi.mocked(adminSetPetService.get).mockResolvedValue(DETAIL);
    renderWithIntl(<AdminSetPetDetailView id="r1" />);
    await screen.findByRole("heading", { name: "SP-000042" });
    expect(screen.queryByRole("button", { name: "Send quote" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel request" })).toBeNull();
  });
});
