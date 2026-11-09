import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { LifeTimelineEntryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { memoriesService } from "@/services/memories.service";
import { LifeTimelineView } from "./LifeTimelineView";

vi.mock("@/services/memories.service", () => ({ memoriesService: { getLifeTimeline: vi.fn() } }));

describe("LifeTimelineView localization", () => {
  beforeEach(() => vi.mocked(memoriesService.getLifeTimeline).mockReset());

  it.each([
    ["de", "Lebensverlauf", "Gesundheitseintrag", "Noch nichts zu zeigen."],
    ["es", "Historial de vida", "Registro de salud", "Aún no hay nada que mostrar."],
  ] as const)("localizes populated and empty timeline states in %s, preserving source summaries", async (locale, heading, healthType, emptyText) => {
    vi.mocked(memoriesService.getLifeTimeline).mockResolvedValue([
      { type: "HEALTH", occurredAt: "2026-01-05T00:00:00.000Z", summary: "Owner-authored visit note", recordId: "record-1", recordType: "VISIT" } as LifeTimelineEntryDto,
    ]);
    const populated = renderWithIntl(<LifeTimelineView petId="pet-1" />, locale);
    expect(await screen.findByRole("heading", { name: heading })).toBeTruthy();
    expect(screen.getByText(healthType)).toBeTruthy();
    expect(screen.getByText("Owner-authored visit note")).toBeTruthy();
    expect(populated.container.textContent).not.toMatch(/[\u0600-\u06FF]/);
    populated.unmount();

    vi.mocked(memoriesService.getLifeTimeline).mockResolvedValue([]);
    const empty = renderWithIntl(<LifeTimelineView petId="pet-1" />, locale);
    expect(await screen.findByText(emptyText)).toBeTruthy();
    expect(empty.container.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });
});
