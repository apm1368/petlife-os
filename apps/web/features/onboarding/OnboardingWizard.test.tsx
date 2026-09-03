import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { OnboardingChapter, OnboardingStatus } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { onboardingService, type OnboardingProgressDto } from "@/services/onboarding.service";
import { petsService } from "@/services/pets.service";
import { OnboardingWizard } from "./OnboardingWizard";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/services/onboarding.service", () => ({ onboardingService: { getProgress: vi.fn() } }));
vi.mock("@/services/pets.service", () => ({ petsService: { getById: vi.fn() } }));

const completed: OnboardingProgressDto = {
  userId: "u1", householdId: "h1", petId: "p1", chapter: OnboardingChapter.READY,
  step: "ready", status: OnboardingStatus.COMPLETED, completedSteps: [], lastCompletedAt: null,
};

describe("Onboarding resume recovery", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(["en", "fa"] as const)("recovers a failed progress request and preserves %s on re-entry", async (locale) => {
    vi.mocked(onboardingService.getProgress)
      .mockRejectedValueOnce(new Error("Service unavailable"))
      .mockResolvedValueOnce(completed);
    renderWithIntl(<OnboardingWizard />, locale);

    const alert = await screen.findByRole("alert");
    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/${locale}/home`));
    expect(alert.isConnected).toBe(false);
    expect(onboardingService.getProgress).toHaveBeenCalledTimes(2);
  });

  it("also catches a failure loading the saved pet instead of leaving an unhandled rejection", async () => {
    vi.mocked(onboardingService.getProgress).mockResolvedValue({
      ...completed, status: OnboardingStatus.IN_PROGRESS,
    });
    vi.mocked(petsService.getById).mockRejectedValue(new Error("Pet unavailable"));
    renderWithIntl(<OnboardingWizard />);

    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });
});
