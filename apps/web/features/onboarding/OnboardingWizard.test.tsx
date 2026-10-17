import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { OnboardingChapter, OnboardingStatus, PetSpecies } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { onboardingService, type OnboardingProgressDto } from "@/services/onboarding.service";
import { petsService } from "@/services/pets.service";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { OnboardingWizard } from "./OnboardingWizard";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/services/onboarding.service", () => ({ onboardingService: { getProgress: vi.fn(), updateProgress: vi.fn() } }));
vi.mock("@/services/pets.service", () => ({ petsService: { getById: vi.fn(), create: vi.fn() } }));

const completed: OnboardingProgressDto = {
  userId: "u1", householdId: "h1", petId: "p1", chapter: OnboardingChapter.READY,
  step: "ready", status: OnboardingStatus.COMPLETED, completedSteps: [], lastCompletedAt: null,
};

describe("Onboarding resume recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useOnboardingStore.getState().reset();
    vi.mocked(onboardingService.updateProgress).mockResolvedValue({} as never);
    vi.mocked(petsService.create).mockResolvedValue({ id: "new-pet", birthDate: null, approximateAgeMonths: null } as never);
  });

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
  it("recovers a cold age checkpoint through identity and then permits unknown-age skip", async () => {
    vi.mocked(onboardingService.getProgress).mockResolvedValue({ ...completed, chapter: OnboardingChapter.PET_IDENTITY, step: "pet-name", petId: null });
    renderWithIntl(<OnboardingWizard />, "fa");
    await screen.findByRole("heading", { name: "چه نوع حیوانی دارید؟" });
    expect(screen.getByText(/اطلاعات اولیهٔ ذخیره‌نشده/)).toBeTruthy();
    expect(petsService.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "گربه" }));
    fireEvent.change(await screen.findByLabelText("اسمش چیست؟"), { target: { value: "کوکی" } });
    fireEvent.click(screen.getByRole("button", { name: "ادامه" }));
    await screen.findByRole("heading", { name: "تاریخ تولد یا سن تقریبی" });
    fireEvent.click(screen.getByRole("button", { name: "فعلاً نمی‌دانم؛ ادامه" }));
    await waitFor(() => expect(petsService.create).toHaveBeenCalledTimes(1));
    expect(vi.mocked(petsService.create).mock.calls[0]![1]).toEqual({ name: "کوکی", species: "CAT" });
    await waitFor(() => expect(useOnboardingStore.getState().petId).toBe("new-pet"));
  });

  it("preserves the same household's unsaved identity instead of forcing re-entry", async () => {
    useOnboardingStore.setState({ householdId: "h1", species: PetSpecies.CAT, name: "Cookie" });
    vi.mocked(onboardingService.getProgress).mockResolvedValue({ ...completed, chapter: OnboardingChapter.PET_IDENTITY, step: "pet-name", petId: null });
    renderWithIntl(<OnboardingWizard />);
    await screen.findByRole("heading", { name: "Birthday or approximate age" });
    expect(useOnboardingStore.getState().name).toBe("Cookie");
    expect(screen.queryByText(/Complete the unsaved/)).toBeNull();
    expect(petsService.create).not.toHaveBeenCalled();
  });

  it("does not reuse another household's draft or pet id on re-entry", async () => {
    useOnboardingStore.setState({ householdId: "old-household", petId: "old-pet", species: PetSpecies.DOG, name: "Old draft" });
    vi.mocked(onboardingService.getProgress).mockResolvedValue({ ...completed, chapter: OnboardingChapter.PET_IDENTITY, step: "age", status: OnboardingStatus.IN_PROGRESS, petId: null });
    renderWithIntl(<OnboardingWizard />, "fa");
    await screen.findByRole("heading", { name: "چه نوع حیوانی دارید؟" });
    expect(useOnboardingStore.getState()).toMatchObject({ householdId: "h1", petId: null, species: null, name: "" });
    expect(petsService.create).not.toHaveBeenCalled();
  });

  it("hydrates the atomically saved pet on cold re-entry and skips age without creating another pet", async () => {
    vi.mocked(onboardingService.getProgress).mockResolvedValue({ ...completed, chapter: OnboardingChapter.PET_IDENTITY, step: "pet-name" });
    vi.mocked(petsService.getById).mockResolvedValue({ id: "p1", name: "Saved pet", species: PetSpecies.CAT, birthDate: null, approximateAgeMonths: null } as never);
    renderWithIntl(<OnboardingWizard />, "fa");
    await screen.findByRole("heading", { name: "تاریخ تولد یا سن تقریبی" });
    fireEvent.click(screen.getByRole("button", { name: "فعلاً نمی‌دانم؛ ادامه" }));
    await waitFor(() => expect(onboardingService.updateProgress).toHaveBeenCalledWith(expect.objectContaining({ petId: "p1", step: "age" })));
    expect(petsService.create).not.toHaveBeenCalled();
    expect(useOnboardingStore.getState()).toMatchObject({ petId: "p1", name: "Saved pet" });
  });

});
