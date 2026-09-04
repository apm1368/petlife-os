import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { HealthTimelineEntryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { HealthTimelineView } from "./HealthTimelineView";

vi.mock("@/services/health-advanced.service", () => ({ healthAdvancedService: { getTimeline: vi.fn() } }));

const SOURCE = { providerOrganizationId: null, providerOrganizationName: null, providerUserId: null, providerUserDisplayTitle: null, userId: "user-1" };

describe("HealthTimelineView", () => {
  beforeEach(() => {
    vi.mocked(healthAdvancedService.getTimeline).mockReset();
  });

  it("shows an explicit empty state, never a fabricated normal timeline", async () => {
    vi.mocked(healthAdvancedService.getTimeline).mockResolvedValue([]);

    renderWithIntl(<HealthTimelineView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("No health events recorded yet.")).toBeTruthy());
  });

  it("always shows a provenance indicator alongside each event, never a bare fact", async () => {
    const entries: HealthTimelineEntryDto[] = [
      {
        type: "LAB_RESULT" as never,
        occurredAt: "2026-08-01T00:00:00.000Z",
        sourceType: "PROVIDER" as never,
        source: { ...SOURCE, providerOrganizationName: "Happy Paws Clinic" },
        summary: "Bloodwork recorded",
        recordId: "lab-1",
        recordType: "LAB_RESULT" as never,
      },
      {
        type: "OBSERVATION" as never,
        occurredAt: "2026-08-02T00:00:00.000Z",
        sourceType: "OWNER" as never,
        source: SOURCE,
        summary: "Owner noted reduced appetite",
        recordId: "obs-1",
        recordType: "OBSERVATION" as never,
      },
    ];
    vi.mocked(healthAdvancedService.getTimeline).mockResolvedValue(entries);

    renderWithIntl(<HealthTimelineView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("Bloodwork recorded")).toBeTruthy());
    expect(screen.getByText("PROVIDER")).toBeTruthy();
    expect(screen.getByText("OWNER")).toBeTruthy();
    expect(screen.getByText("Happy Paws Clinic")).toBeTruthy();
    expect(screen.getByText("Owner noted reduced appetite")).toBeTruthy();
  });
});
