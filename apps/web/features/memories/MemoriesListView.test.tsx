import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { PetDto, PetMemoryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { memoriesService } from "@/services/memories.service";
import { petsService } from "@/services/pets.service";
import { MemoriesListView } from "./MemoriesListView";

vi.mock("@/services/memories.service", () => ({ memoriesService: { list: vi.fn(), getMemorial: vi.fn(), submitMemorial: vi.fn(), withdrawMemorial: vi.fn() } }));
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

describe("MemoriesListView", () => {
  beforeEach(() => {
    vi.mocked(petsService.getById).mockReset();
    vi.mocked(memoriesService.list).mockReset();
    vi.mocked(memoriesService.getMemorial).mockReset().mockResolvedValue(null);
    vi.mocked(memoriesService.submitMemorial).mockReset();
    vi.mocked(memoriesService.withdrawMemorial).mockReset();
  });

  it("shows a plain memories heading for an active pet", async () => {
    vi.mocked(petsService.getById).mockResolvedValue(pet());
    vi.mocked(memoriesService.list).mockResolvedValue([memory()]);

    renderWithIntl(<MemoriesListView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("First trip to the beach")).toBeTruthy());
    expect(screen.getByText("Milo's memories")).toBeTruthy();
  });

  it("switches to a respectful memorial heading and subtitle for a deceased pet, per the no-commercial-nudge spec", async () => {
    vi.mocked(petsService.getById).mockResolvedValue(pet({ lifecycleStatus: "MEMORIAL" as never }));
    vi.mocked(memoriesService.list).mockResolvedValue([memory()]);

    renderWithIntl(<MemoriesListView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("In loving memory of Milo")).toBeTruthy());
    expect(screen.getByText("A place to keep the moments you shared together.")).toBeTruthy();
  });

  it("shows a localized empty state when there are no memories yet", async () => {
    vi.mocked(petsService.getById).mockResolvedValue(pet());
    vi.mocked(memoriesService.list).mockResolvedValue([]);

    renderWithIntl(<MemoriesListView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("No memories yet. Add the first one.")).toBeTruthy());
  });

  it.each([
    ["de", "Noch keine Erinnerungen. Fügen Sie die erste hinzu.", "Erinnerungen von Milo", "Januar"],
    ["es", "Aún no hay recuerdos. Añade el primero.", "Recuerdos de Milo", "enero"],
  ] as const)("renders the complete list and empty state in %s without translating user content", async (locale, emptyText, heading, month) => {
    vi.mocked(petsService.getById).mockResolvedValue(pet());
    vi.mocked(memoriesService.list).mockResolvedValue([memory({ title: "Original user-authored title" })]);

    const { container, unmount } = renderWithIntl(<MemoriesListView petId="pet-1" />, locale);
    await waitFor(() => expect(screen.getByText(heading)).toBeTruthy());
    expect(screen.getByText("Original user-authored title")).toBeTruthy();
    expect(container.textContent).not.toMatch(/[\u0600-\u06FF]/);
    expect(container.textContent).toContain(month);

    unmount();
    vi.mocked(memoriesService.list).mockResolvedValue([]);
    const emptyRender = renderWithIntl(<MemoriesListView petId="pet-1" />, locale);
    await waitFor(() => expect(screen.getByText(emptyText)).toBeTruthy());
    expect(emptyRender.container.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });
});
