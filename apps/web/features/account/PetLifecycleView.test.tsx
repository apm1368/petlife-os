import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PetDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { petsService } from "@/services/pets.service";
import { ApiError } from "@/lib/api/client";
import { PetLifecycleView } from "./PetLifecycleView";

const replace = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push }) }));
vi.mock("@/services/pets.service", () => ({
  petsService: {
    getById: vi.fn(),
    markDeceased: vi.fn(),
    transitionToMemorial: vi.fn(),
    correctLifecycleToActive: vi.fn(),
  },
}));

const lostPet = { id: "pet-1", name: "Mishi", lifecycleStatus: "LOST", species: "CAT" } as PetDto;

describe("PetLifecycleView — PT-03 correction", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(petsService.getById).mockReset().mockResolvedValue(lostPet);
    vi.mocked(petsService.correctLifecycleToActive)
      .mockReset()
      .mockResolvedValue({ ...lostPet, lifecycleStatus: "ACTIVE" } as PetDto);
  });

  it("requires an accountable reason before an owner can submit a lifecycle correction", async () => {
    renderWithIntl(<PetLifecycleView petId="pet-1" />, "en");
    fireEvent.click(await screen.findByRole("button", { name: "Correct an accidental status" }));

    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Reason for correction"), {
      target: { value: "The report was opened by mistake." },
    });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(petsService.correctLifecycleToActive).toHaveBeenCalledWith(
        "pet-1",
        "The report was opened by mistake.",
      ),
    );
  });

  it("routes an expired self-service correction to the existing support flow", async () => {
    vi.mocked(petsService.correctLifecycleToActive).mockRejectedValue(
      new ApiError(
        {
          code: "PET_LIFECYCLE_CORRECTION_WINDOW_EXPIRED",
          message: "The self-service correction window has expired.",
          requestId: "request-1",
        },
        409,
      ),
    );
    renderWithIntl(<PetLifecycleView petId="pet-1" />, "en");
    fireEvent.click(await screen.findByRole("button", { name: "Correct an accidental status" }));
    fireEvent.change(screen.getByLabelText("Reason for correction"), {
      target: { value: "This needs a support review." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    const support = await screen.findByRole("button", { name: "Contact support" });
    fireEvent.click(support);
    expect(push).toHaveBeenCalledWith("/en/support/new");
  });
});
