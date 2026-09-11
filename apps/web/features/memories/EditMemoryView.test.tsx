import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PetMemoryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { memoriesService } from "@/services/memories.service";
import { EditMemoryView, parseTags } from "./EditMemoryView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/memories.service", () => ({ memoriesService: { get: vi.fn(), update: vi.fn() } }));

function memory(overrides: Partial<PetMemoryDto> = {}): PetMemoryDto {
  return {
    id: "memory-1",
    petId: "pet-1",
    householdId: "household-1",
    createdByUserId: "user-1",
    type: "STORY" as never,
    title: "A quiet Sunday",
    description: "He slept all afternoon",
    occurredAt: "2026-01-05T00:00:00.000Z",
    mediaObjectKeys: [],
    mediaUrls: [],
    location: null,
    visibility: "PRIVATE" as never,
    tags: ["funny-moment"],
    archivedAt: null,
    createdAt: "2026-01-05T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("EditMemoryView", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(memoriesService.get).mockReset();
    vi.mocked(memoriesService.update).mockReset();
  });

  it("prefills the form from the existing memory", async () => {
    vi.mocked(memoriesService.get).mockResolvedValue(memory());

    renderWithIntl(<EditMemoryView petId="pet-1" memoryId="memory-1" />);

    await waitFor(() => expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("A quiet Sunday"));
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2026-01-05");
    expect((screen.getByLabelText("Tags") as HTMLInputElement).value).toBe("funny-moment");
  });

  it("saves edits, including parsed tags, then returns to the memory", async () => {
    vi.mocked(memoriesService.get).mockResolvedValue(memory());
    vi.mocked(memoriesService.update).mockResolvedValue(memory());

    renderWithIntl(<EditMemoryView petId="pet-1" memoryId="memory-1" />);
    await waitFor(() => expect(screen.getByLabelText("Tags")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Tags"), { target: { value: "trip, milestone , trip" } });
    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() =>
      expect(memoriesService.update).toHaveBeenCalledWith("pet-1", "memory-1", expect.objectContaining({ tags: ["trip", "milestone"] })),
    );
    expect(push).toHaveBeenCalledWith("/pets/pet-1/memories/memory-1");
  });

  it("clears an emptied title rather than persisting whitespace", async () => {
    vi.mocked(memoriesService.get).mockResolvedValue(memory());
    vi.mocked(memoriesService.update).mockResolvedValue(memory());

    renderWithIntl(<EditMemoryView petId="pet-1" memoryId="memory-1" />);
    await waitFor(() => expect(screen.getByLabelText("Title")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "   " } });
    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => expect(memoriesService.update).toHaveBeenCalledWith("pet-1", "memory-1", expect.objectContaining({ title: undefined })));
  });
});

describe("parseTags", () => {
  it("trims, drops blanks, and de-duplicates", () => {
    expect(parseTags(" trip , , milestone,trip ")).toEqual(["trip", "milestone"]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseTags("")).toEqual([]);
  });
});
