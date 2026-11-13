import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { AdminSetPetDetailDto, AdminSetPetListDto, AdminSetPetSettingsDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminSetPetService } from "@/services/admin-set-pet.service";
import { useAdminStore } from "@/stores/admin-store";
import { AdminSetPetDetailView, AdminSetPetPricesView, AdminSetPetQueueView } from "./AdminSetPetViews";

vi.mock("@/services/admin-set-pet.service", () => ({
  adminSetPetService: { list: vi.fn(), get: vi.fn(), proofUploadTarget: vi.fn(), sendProof: vi.fn(), proofLink: vi.fn(), rejectDesign: vi.fn(), setStatus: vi.fn(), saveNote: vi.fn(), download: vi.fn(), settings: vi.fn(), saveSettings: vi.fn() },
}));

const svc = vi.mocked(adminSetPetService);
const COUNTS = { SUBMITTED: 1, NEEDS_NEW_DESIGN: 0, PROOF_SENT: 0, AWAITING_PAYMENT: 0, PAID: 2, IN_PRODUCTION: 0, SHIPPED: 0, CANCELLED: 0 };
const LIST: AdminSetPetListDto = {
  items: [{ id: "r1", number: "SP-000042", status: "SUBMITTED", memberName: "Sara", humanGarments: 2, petGarments: 1, placements: 3, itemsTotalIrr: 21_150_000, totalPaidIrr: null, estimatedReadyAt: null, createdAt: "2026-11-13T09:00:00Z", updatedAt: "2026-11-13T09:00:00Z" }],
  total: 1,
  page: 1,
  pageSize: 30,
  counts: COUNTS,
};
const file = { id: "f1", mimeType: "image/svg+xml", fileSizeBytes: 2048, originalFilename: "logo.svg", previewable: false, widthPx: null, heightPx: null, status: "READY" as const, uploadedAt: "2026-11-13T09:00:00Z" };
const DETAIL: AdminSetPetDetailDto = {
  id: "r1",
  number: "SP-000042",
  status: "SUBMITTED",
  member: { id: "u1", displayName: "Sara" },
  forPet: null,
  items: [
    { position: 0, garment: "HUMAN_HOODIE", size: "XXL", colour: "black", petId: null, petName: null, petSpecies: null, pet: null },
    { position: 1, garment: "PET_BANDANA", size: "S", colour: "black", petId: null, petName: "Pishi", petSpecies: "CAT", pet: null },
  ],
  placements: [
    { zone: "FRONT_CENTER", designFileId: "f1", text: null, font: null, textColour: null, scale: 1, offsetX: 0, offsetY: 0, designFile: file },
    { zone: "PET_BACK", designFileId: null, text: "Pishi", font: "LALEZAR", textColour: "white", scale: 1, offsetX: 0, offsetY: 0, designFile: null },
  ],
  notes: null,
  price: { lines: [], subtotalIrr: 10_000_000, discountPercent: 10, discountIrr: 1_000_000, totalIrr: 9_000_000 },
  payment: { shippingProvider: null, shippingIrr: null, shippingAddress: null, totalPaidIrr: null, paidAt: null, refundedIrr: null, refundedAt: null },
  proofs: [],
  designRejectReason: null,
  estimatedReadyAt: null,
  shippingNote: null,
  cancelled: null,
  adminNote: null,
  actions: { sendProof: true, rejectDesign: true, startProduction: false, ship: false, cancel: true, refundsOnCancel: false, printDefectOnly: false },
  timeline: [{ id: "e1", at: "2026-11-13T09:00:00Z", from: null, to: "SUBMITTED", actor: "MEMBER", staffName: null, note: null }],
  createdAt: "2026-11-13T09:00:00Z",
  updatedAt: "2026-11-13T09:00:00Z",
};
const SETTINGS: AdminSetPetSettingsDto = {
  garmentPricesIrr: { HUMAN_TEE: 4_000_000 },
  zonePricesIrr: {},
  setDiscountPercent: 10,
  productionWorkingDays: 5,
  workshopCity: null,
  workshopLatitude: null,
  workshopLongitude: null,
  updatedAt: null,
};

function permissions(values: string[]) {
  useAdminStore.setState({ context: { isAdmin: true, adminUserId: "a1", displayName: "Ops", role: "COMMERCE_OPERATIONS", permissions: values } as never, status: "ready" });
}

describe("admin Set Pet views (owner's #368 answers)", () => {
  beforeEach(() => {
    Object.values(svc).forEach((fn) => fn.mockReset());
    permissions(["commerce.view", "commerce.manage"]);
  });

  it("opens on orders that need a proof, with counts per status and a link to the price table", async () => {
    svc.list.mockResolvedValue(LIST);
    renderWithIntl(<AdminSetPetQueueView />);
    await screen.findByRole("link", { name: "SP-000042 · Sara" });
    expect(svc.list).toHaveBeenCalledWith({ status: "SUBMITTED", q: undefined, page: 1 });
    expect(screen.getByRole("tab", { name: "Needs proof (1)" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("2 for people, 1 for pets, 3 print areas")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Price table" }).getAttribute("href")).toBe("/en/admin/commerce/set-pet/prices");
    fireEvent.click(screen.getByRole("tab", { name: "Paid, to print (2)" }));
    await waitFor(() => expect(svc.list).toHaveBeenLastCalledWith({ status: "PAID", q: undefined, page: 1 }));
  });

  it("uploads and sends a print proof with the pet print size, and refuses a design with a reason", async () => {
    svc.get.mockResolvedValue(DETAIL);
    svc.proofUploadTarget.mockResolvedValue({ proofId: "p1", uploadUrl: "/api/uploads/p1", method: "PUT", headers: { "Content-Type": "image/png" }, expiresInSeconds: 600 });
    svc.sendProof.mockResolvedValue({ ...DETAIL, status: "PROOF_SENT" });
    svc.rejectDesign.mockResolvedValue({ ...DETAIL, status: "NEEDS_NEW_DESIGN" });
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderWithIntl(<AdminSetPetDetailView id="r1" />);
    await screen.findByRole("heading", { name: "SP-000042" });
    expect(screen.getByText(/Hoodie · 2XL · Black/)).toBeTruthy();
    expect(screen.getByText(/Text «Pishi»/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Send print proof" }));
    const png = new File([new Uint8Array([137, 80, 78, 71])], "proof.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Proof image (JPG, PNG or WebP)"), { target: { files: [png] } });
    fireEvent.change(screen.getByLabelText("Pet print width (cm)"), { target: { value: "18" } });
    fireEvent.change(screen.getByLabelText("Pet print height (cm)"), { target: { value: "16" } });
    fireEvent.change(screen.getByLabelText("Note to the member"), { target: { value: "Front 20×20" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Send print proof" }).at(-1)!);
    await waitFor(() => expect(svc.sendProof).toHaveBeenCalledWith("r1", "p1", { note: "Front 20×20", petPrintWidthCm: 18, petPrintHeightCm: 16 }));
    expect(svc.proofUploadTarget).toHaveBeenCalledWith("r1", { contentType: "image/png", fileSizeBytes: 4 });
    expect(fetchMock).toHaveBeenCalledWith("/api/uploads/p1", expect.objectContaining({ method: "PUT", credentials: "omit" }));

    fireEvent.click(screen.getByRole("button", { name: "Refuse a design" }));
    fireEvent.change(screen.getByLabelText(/Why it can't be printed/), { target: { value: "Registered brand logo" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(svc.rejectDesign).toHaveBeenCalledWith("r1", "Registered brand logo"));
    vi.unstubAllGlobals();
  });

  it("after printing starts, cancels only as a confirmed print defect", async () => {
    svc.get.mockResolvedValue({ ...DETAIL, status: "IN_PRODUCTION", payment: { ...DETAIL.payment, totalPaidIrr: 9_600_000 }, actions: { ...DETAIL.actions, sendProof: false, rejectDesign: false, ship: true, refundsOnCancel: true, printDefectOnly: true } });
    svc.setStatus.mockResolvedValue({ ...DETAIL, status: "CANCELLED" });
    renderWithIntl(<AdminSetPetDetailView id="r1" />);
    await screen.findByRole("heading", { name: "SP-000042" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel for a print defect" }));
    fireEvent.change(screen.getByLabelText("Reason (the member reads it)"), { target: { value: "Print peeled" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText(/cancel only for a print defect/)).toBeTruthy();
    expect(svc.setStatus).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(svc.setStatus).toHaveBeenCalledWith("r1", { to: "CANCELLED", note: "Print peeled", shippingNote: undefined, printDefect: true }));
  });

  it("opens a design only after a reason, and shows no actions to read-only staff", async () => {
    svc.get.mockResolvedValue(DETAIL);
    svc.download.mockResolvedValue({ fileId: "f1", filename: "logo.svg", downloadUrl: "https://files.example/x", expiresInSeconds: 300 });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const { unmount } = renderWithIntl(<AdminSetPetDetailView id="r1" />);
    await screen.findByRole("heading", { name: "SP-000042" });
    fireEvent.click(screen.getByRole("button", { name: "Open design" }));
    fireEvent.change(screen.getByLabelText("Why are you opening it?"), { target: { value: "Check resolution" } });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(svc.download).toHaveBeenCalledWith("r1", "f1", "Check resolution"));
    expect(open).toHaveBeenCalledWith("https://files.example/x", "_blank", "noopener,noreferrer");
    unmount();

    permissions(["commerce.view"]);
    renderWithIntl(<AdminSetPetDetailView id="r1" />);
    await screen.findByRole("heading", { name: "SP-000042" });
    expect(screen.queryByRole("button", { name: "Send print proof" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel order" })).toBeNull();
  });

  it("edits the price table in toman and saves it as IRR", async () => {
    svc.settings.mockResolvedValue(SETTINGS);
    svc.saveSettings.mockResolvedValue({ ...SETTINGS, updatedAt: "2026-11-13T12:00:00Z" });
    renderWithIntl(<AdminSetPetPricesView />);
    expect(((await screen.findByLabelText("T-shirt (toman)")) as HTMLInputElement).value).toBe("400000");
    fireEvent.change(screen.getByLabelText("Bandana (toman)"), { target: { value: "۱۵۰۰۰۰" } });
    fireEvent.change(screen.getByLabelText("Front (toman)"), { target: { value: "120000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save prices" }));
    await waitFor(() => expect(svc.saveSettings).toHaveBeenCalled());
    const saved = svc.saveSettings.mock.calls[0]![0];
    expect(saved.garmentPricesIrr).toMatchObject({ HUMAN_TEE: 4_000_000, PET_BANDANA: 1_500_000, HUMAN_HOODIE: 0 });
    expect(saved.zonePricesIrr).toMatchObject({ FRONT_CENTER: 1_200_000 });
    expect(saved.setDiscountPercent).toBe(10);
    expect(await screen.findByText(/Prices saved/)).toBeTruthy();
  });
});
