import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PetDto, PetMemoryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { memoriesService } from "@/services/memories.service";
import { petsService } from "@/services/pets.service";
import { MemoriesListView } from "./MemoriesListView";

vi.mock("@/services/memories.service", () => ({
  memoriesService: { list: vi.fn(), restore: vi.fn(), getMediaDownload: vi.fn() },
}));
vi.mock("@/services/pets.service", () => ({ petsService: { getById: vi.fn() } }));

function pet(overrides: Partial<PetDto> = {}): PetDto {
  return {
    id: "pet-1",
    householdId: "household-1",
    name: "Milo",
    species: "DOG" as never,
    breed: null,
    sex: null,
    colorMarkings: null,
    neuteredStatus: null,
    microchipNumber: null,
    approximateAgeMonths: null,
    birthDate: null,
    photoUrl: null,
    latestWeightValue: null,
    latestWeightUnit: null,
    lifecycleStatus: "ACTIVE" as never,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function memory(overrides: Partial<PetMemoryDto> = {}): PetMemoryDto {
  return {
    id: "memory-1",
    petId: "pet-1",
    householdId: "household-1",
    createdByUserId: "user-1",
    type: "PHOTO" as never,
    title: "First trip to the beach",
    description: null,
    occurredAt: "2026-01-01T00:00:00.000Z",
    mediaObjectKeys: [],
    mediaUrls: [],
    location: null,
    visibility: "PRIVATE" as never,
    tags: [],
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("MemoriesListView browsing (Handoff 21)", () => {
  beforeEach(() => {
    vi.mocked(petsService.getById).mockReset();
    vi.mocked(memoriesService.list).mockReset();
    vi.mocked(memoriesService.restore).mockReset();
    vi.mocked(petsService.getById).mockResolvedValue(pet());
  });

  it("sends the typed text search to the API rather than filtering client-side", async () => {
    vi.mocked(memoriesService.list).mockResolvedValue([memory()]);
    renderWithIntl(<MemoriesListView petId="pet-1" />);
    await waitFor(() => expect(screen.getByText("First trip to the beach")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Search memories"), { target: { value: "beach" } });

    await waitFor(() => expect(memoriesService.list).toHaveBeenCalledWith("pet-1", expect.objectContaining({ search: "beach" })));
  });

  it("offers tag and year filters built from the entries themselves", async () => {
    vi.mocked(memoriesService.list).mockResolvedValue([memory({ tags: ["trip"], occurredAt: "2024-06-01T00:00:00.000Z" })]);
    renderWithIntl(<MemoriesListView petId="pet-1" />);
    await waitFor(() => expect(screen.getByLabelText("Tag")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Tag"), { target: { value: "trip" } });
    await waitFor(() => expect(memoriesService.list).toHaveBeenCalledWith("pet-1", expect.objectContaining({ tag: "trip" })));

    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2024" } });
    await waitFor(() => expect(memoriesService.list).toHaveBeenCalledWith("pet-1", expect.objectContaining({ year: 2024 })));
  });

  it("groups the journal view by year", async () => {
    vi.mocked(memoriesService.list).mockResolvedValue([
      memory({ id: "m-2025", title: "Newer", occurredAt: "2025-03-10T00:00:00.000Z" }),
      memory({ id: "m-2024", title: "Older", occurredAt: "2024-06-01T00:00:00.000Z" }),
    ]);
    renderWithIntl(<MemoriesListView petId="pet-1" />);

    // Scoped to headings: the years also appear as options in the year filter.
    await waitFor(() => expect(screen.getByRole("heading", { name: "2025" })).toBeTruthy());
    expect(screen.getByRole("heading", { name: "2024" })).toBeTruthy();
  });

  it("switches to the archive view, requests archived entries, and restores one", async () => {
    vi.mocked(memoriesService.list).mockResolvedValue([memory({ archivedAt: "2026-02-01T00:00:00.000Z" })]);
    vi.mocked(memoriesService.restore).mockResolvedValue(memory());

    renderWithIntl(<MemoriesListView petId="pet-1" />);
    await waitFor(() => expect(screen.getByText("Archived")).toBeTruthy());

    fireEvent.click(screen.getByText("Archived"));
    await waitFor(() => expect(memoriesService.list).toHaveBeenCalledWith("pet-1", expect.objectContaining({ includeArchived: true })));

    await waitFor(() => expect(screen.getByText("Restore")).toBeTruthy());
    fireEvent.click(screen.getByText("Restore"));
    await waitFor(() => expect(memoriesService.restore).toHaveBeenCalledWith("pet-1", "memory-1"));
  });

  it("renders a placeholder instead of a broken image when a memory has no photo", async () => {
    vi.mocked(memoriesService.list).mockResolvedValue([memory()]);
    renderWithIntl(<MemoriesListView petId="pet-1" />);

    await waitFor(() => expect(screen.getAllByText("No photo").length).toBeGreaterThan(0));
    expect(memoriesService.getMediaDownload).not.toHaveBeenCalled();
  });

  it("mints a signed download for a PRIVATE memory's thumbnail instead of using a public URL", async () => {
    vi.mocked(memoriesService.list).mockResolvedValue([memory({ mediaObjectKeys: ["pet-memories-private/abc.jpg"] })]);
    vi.mocked(memoriesService.getMediaDownload).mockResolvedValue({ downloadUrl: "https://signed.example/abc", expiresInSeconds: 300 });

    renderWithIntl(<MemoriesListView petId="pet-1" />);

    await waitFor(() => expect(memoriesService.getMediaDownload).toHaveBeenCalledWith("pet-1", "memory-1", 0));
    await waitFor(() => {
      const img = screen.getAllByAltText("First trip to the beach")[0] as HTMLImageElement;
      expect(img.src).toBe("https://signed.example/abc");
    });
  });
});
