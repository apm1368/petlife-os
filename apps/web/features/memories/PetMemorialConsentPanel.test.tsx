import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PetMemoryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { memoriesService } from "@/services/memories.service";
import { PetMemorialConsentPanel } from "./PetMemorialConsentPanel";

vi.mock("@/services/memories.service", () => ({ memoriesService: { getMemorial: vi.fn(), submitMemorial: vi.fn(), withdrawMemorial: vi.fn() } }));
function photo(overrides: Partial<PetMemoryDto> = {}): PetMemoryDto {
  return { id: "photo-1", petId: "pet-1", householdId: "house-1", createdByUserId: "user-1", type: "PHOTO" as never, title: "Garden photo", description: "private details", occurredAt: "2026-01-01T00:00:00.000Z", mediaObjectKeys: ["pet-memories-public/pet-1/photo.webp"], mediaUrls: ["https://media.example/photo.webp"], location: null, visibility: "PUBLIC" as never, tags: [], archivedAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

describe("PetMemorialConsentPanel", () => {
  beforeEach(() => {
    vi.mocked(memoriesService.getMemorial).mockReset().mockResolvedValue(null);
    vi.mocked(memoriesService.submitMemorial).mockReset();
    vi.mocked(memoriesService.withdrawMemorial).mockReset();
  });

  it("requires a separate explicit consent and only offers eligible public photo memories", async () => {
    vi.mocked(memoriesService.submitMemorial).mockResolvedValue({ id: "memorial-1", displayName: "Milo", status: "PENDING_REVIEW", consentedAt: "2026-01-01T00:00:00.000Z", submittedAt: "2026-01-01T00:00:00.000Z", reviewedAt: null, reviewReason: null, withdrawnAt: null });
    renderWithIntl(<PetMemorialConsentPanel petId="pet-1" petName="Milo" memories={[photo(), photo({ id: "private-photo", title: "Do not list", visibility: "PRIVATE" as never }), photo({ id: "archived", archivedAt: "2026-01-02T00:00:00.000Z" })]} />);
    const submit = await screen.findByRole("button", { name: "Submit for review" });
    expect(submit).toHaveProperty("disabled", true);
    expect(screen.getByRole("option", { name: "Garden photo" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Do not list" })).toBeNull();
    expect(screen.queryByRole("option", { name: "archived" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Choose a photo"), { target: { value: "photo-1" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(submit);
    await waitFor(() => expect(memoriesService.submitMemorial).toHaveBeenCalledWith("pet-1", { displayName: "Milo", imageMemoryId: "photo-1", consent: true }));
    expect(await screen.findByText("Waiting for admin review. It is not public yet.")).toBeTruthy();
  });

  it("keeps owner withdrawal available after publication", async () => {
    vi.mocked(memoriesService.getMemorial).mockResolvedValue({ id: "memorial-1", displayName: "Milo", status: "PUBLISHED", consentedAt: "2026-01-01T00:00:00.000Z", submittedAt: "2026-01-01T00:00:00.000Z", reviewedAt: "2026-01-02T00:00:00.000Z", reviewReason: null, withdrawnAt: null });
    vi.mocked(memoriesService.withdrawMemorial).mockResolvedValue({ withdrawn: true });
    renderWithIntl(<PetMemorialConsentPanel petId="pet-1" petName="Milo" memories={[]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw public consent and remove from the memorial" }));
    await waitFor(() => expect(memoriesService.withdrawMemorial).toHaveBeenCalledWith("pet-1"));
  });

  it("does not suggest that a transport failure is a permission denial", async () => {
    vi.mocked(memoriesService.getMemorial).mockRejectedValue(new Error("offline"));
    renderWithIntl(<PetMemorialConsentPanel petId="pet-1" petName="Milo" memories={[]} />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Only a household owner can manage this public memorial.")).toBeNull();
  });
});
