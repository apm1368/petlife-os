import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { PetMemoryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { memoriesService } from "@/services/memories.service";
import { MemoryDetailView } from "./MemoryDetailView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("@/services/memories.service", () => ({ memoriesService: { get: vi.fn(), getMediaDownload: vi.fn(), delete: vi.fn(), restore: vi.fn() } }));

function memory(overrides: Partial<PetMemoryDto> = {}): PetMemoryDto {
  return {
    id: "memory-1", petId: "pet-1", householdId: "household-1", createdByUserId: "user-1",
    type: "STORY" as never, title: "A quiet Sunday", description: "He slept all afternoon",
    occurredAt: "2026-01-05T00:00:00.000Z", mediaObjectKeys: [], mediaUrls: [], location: null,
    visibility: "PRIVATE" as never, tags: ["family note"], archivedAt: "2026-01-06T00:00:00.000Z",
    createdAt: "2026-01-05T00:00:00.000Z", updatedAt: "2026-01-06T00:00:00.000Z", ...overrides,
  };
}

describe("MemoryDetailView localization", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(memoriesService.get).mockReset().mockResolvedValue(memory());
    vi.mocked(memoriesService.getMediaDownload).mockReset();
  });

  it.each([
    ["de", "Diese Erinnerung ist archiviert. Sie bleibt hier sicher gespeichert und kann jederzeit wiederhergestellt werden.", "Bearbeiten", "Erinnerung wiederherstellen"],
    ["es", "Este recuerdo está archivado. Se conserva aquí y puedes restaurarlo cuando quieras.", "Editar", "Restaurar recuerdo"],
  ] as const)("localizes the archived detail controls in %s while preserving authored text", async (locale, notice, edit, restore) => {
    const { container } = renderWithIntl(<MemoryDetailView petId="pet-1" memoryId="memory-1" />, locale);

    expect(await screen.findByText("A quiet Sunday")).toBeTruthy();
    expect(screen.getByText("He slept all afternoon")).toBeTruthy();
    expect(screen.getByText(notice)).toBeTruthy();
    expect(screen.getByRole("link", { name: edit }).getAttribute("href")).toBe(`/${locale}/pets/pet-1/memories/memory-1/edit`);
    expect(screen.getByRole("button", { name: restore })).toBeTruthy();
    expect(container.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });
});
