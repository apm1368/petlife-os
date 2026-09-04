import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PetObservationDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { petObservationService } from "@/services/pet-observation.service";
import { HealthObservationsView } from "./HealthObservationsView";

vi.mock("@/services/pet-observation.service", () => ({
  petObservationService: { list: vi.fn(), requestMediaUpload: vi.fn(), create: vi.fn() },
}));

describe("HealthObservationsView", () => {
  beforeEach(() => {
    vi.mocked(petObservationService.list).mockReset();
    vi.mocked(petObservationService.create).mockReset();
  });

  it("always shows the owner-observation disclaimer, distinguishing observations from diagnoses", async () => {
    vi.mocked(petObservationService.list).mockResolvedValue([]);

    renderWithIntl(<HealthObservationsView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("Owner observation — not a diagnosis.")).toBeTruthy());
    expect(screen.getByText("No observations recorded yet.")).toBeTruthy();
  });

  it("lists recorded observations by category without ever presenting them as a diagnosis", async () => {
    const obs: PetObservationDto = {
      id: "obs-1",
      petId: "pet-1",
      category: "APPETITE" as never,
      description: "Ate less than usual today",
      observedAt: "2026-08-01T00:00:00.000Z",
      mediaType: null,
      hasMedia: false,
      sourceType: "OWNER" as never,
      recordedByUserId: "user-1",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    } as PetObservationDto;
    vi.mocked(petObservationService.list).mockResolvedValue([obs]);

    renderWithIntl(<HealthObservationsView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("Ate less than usual today")).toBeTruthy());
    expect(screen.getAllByText("APPETITE").length).toBeGreaterThan(0);
    // No "diagnosis" field or label is ever attached to the recorded entry itself.
    expect(screen.queryByLabelText(/diagnosis/i)).toBeNull();
  });

  it("saves a new observation with a category and description", async () => {
    vi.mocked(petObservationService.list).mockResolvedValue([]);
    vi.mocked(petObservationService.create).mockResolvedValue({} as PetObservationDto);

    renderWithIntl(<HealthObservationsView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("Owner observation — not a diagnosis.")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Limping on the left front paw" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(petObservationService.create).toHaveBeenCalledWith(
        "pet-1",
        expect.objectContaining({ description: "Limping on the left front paw" }),
      ),
    );
  });
});
