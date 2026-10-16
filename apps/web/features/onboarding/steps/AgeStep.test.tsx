import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { PetSpecies } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { petsService } from "@/services/pets.service";
import { onboardingService } from "@/services/onboarding.service";
import { AgeStep } from "./AgeStep";
vi.mock("@/services/pets.service", () => ({ petsService: { create: vi.fn(), getById: vi.fn(), update: vi.fn() } }));
vi.mock("@/services/onboarding.service", () => ({ onboardingService: { updateProgress: vi.fn() } }));
const pet = { id: "pet1", birthDate: null, approximateAgeMonths: null };
describe("Onboarding birth date", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useOnboardingStore.setState({ householdId: "h1", species: PetSpecies.CAT, name: "Cookie", petId: null, birthDate: null, approximateAgeMonths: null });
    vi.mocked(petsService.create).mockResolvedValue(pet as never);
    vi.mocked(petsService.getById).mockResolvedValue(pet as never);
    vi.mocked(petsService.update).mockResolvedValue(pet as never);
    vi.mocked(onboardingService.updateProgress).mockResolvedValue({} as never);
  });
  it("skips an unknown age while still creating the pet required by subsequent steps", async () => {
    const next = vi.fn();
    renderWithIntl(<AgeStep onNext={next} />, "fa");
    fireEvent.click(screen.getByRole("button", { name: "فعلاً نمی‌دانم؛ ادامه" }));
    await waitFor(() => expect(next).toHaveBeenCalledWith("pet1"));
    expect(vi.mocked(petsService.create).mock.calls[0]![1]).toEqual({ name: "Cookie", species: "CAT" });
    expect(onboardingService.updateProgress).toHaveBeenCalledWith(expect.objectContaining({ petId: "pet1", step: "age", status: "COMPLETED" }));
  });
  it("retains the date and retries progress without creating a second pet", async () => {
    vi.mocked(onboardingService.updateProgress).mockRejectedValueOnce(new Error("offline"));
    renderWithIntl(<AgeStep onNext={vi.fn()} />, "fa");
    fireEvent.change(screen.getByLabelText("سال"), { target: { value: "1403" } });
    fireEvent.change(screen.getByLabelText("ماه"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("روز"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "ادامه" }));
    await screen.findByRole("alert");
    expect(vi.mocked(petsService.create).mock.calls[0]![1]).toEqual({ name: "Cookie", species: "CAT", birthDate: "2024-03-20" });
    expect((screen.getByLabelText("سال") as HTMLSelectElement).value).toBe("1403");
    fireEvent.click(screen.getByRole("button", { name: "ادامه" }));
    await waitFor(() => expect(onboardingService.updateProgress).toHaveBeenCalledTimes(2));
    expect(petsService.create).toHaveBeenCalledTimes(1);
    expect(petsService.update).toHaveBeenCalledWith("pet1", { birthDate: "2024-03-20", approximateAgeMonths: null });
  });
  it("clears the saved exact date when a progress retry switches to a newborn's approximate age", async () => {
    vi.mocked(onboardingService.updateProgress).mockRejectedValueOnce(new Error("offline"));
    vi.mocked(petsService.create).mockResolvedValue({ ...pet, birthDate: "2024-03-20" } as never);
    renderWithIntl(<AgeStep onNext={vi.fn()} />, "fa");
    fireEvent.change(screen.getByLabelText("سال"), { target: { value: "1403" } });
    fireEvent.change(screen.getByLabelText("ماه"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("روز"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "ادامه" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "تاریخ تولد دقیق را نمی‌دانم" }));
    fireEvent.change(screen.getByLabelText("سن تقریبی (ماه)"), { target: { value: "۰" } });
    fireEvent.click(screen.getByRole("button", { name: "ادامه" }));
    await waitFor(() => expect(onboardingService.updateProgress).toHaveBeenCalledTimes(2));
    expect(petsService.create).toHaveBeenCalledTimes(1);
    expect(petsService.update).toHaveBeenCalledWith("pet1", { birthDate: null, approximateAgeMonths: 0 });
  });

});
