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
    vi.mocked(petsService.create).mockImplementation(async (_householdId, input) => ({ ...pet, ...input }) as never);
    vi.mocked(petsService.getById).mockResolvedValue(pet as never);
    vi.mocked(petsService.update).mockImplementation(async (_petId, input) => ({ ...pet, ...input }) as never);
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
  it("encodes Persian names into a valid ASCII request header without changing the pet name", async () => {
    useOnboardingStore.setState({ name: "کوکی" });
    const next = vi.fn();
    renderWithIntl(<AgeStep onNext={next} />, "fa");
    fireEvent.click(screen.getByRole("button", { name: "فعلاً نمی‌دانم؛ ادامه" }));
    await waitFor(() => expect(next).toHaveBeenCalledWith("pet1"));
    const [, body, key] = vi.mocked(petsService.create).mock.calls[0]!;
    expect(body.name).toBe("کوکی");
    expect(new Headers({ "Idempotency-Key": key }).get("Idempotency-Key")).toBe(`onboarding-pet-h1-${encodeURIComponent("کوکی")}`);
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

  it("applies the new age when a retry replays the original create response", async () => {
    useOnboardingStore.setState({ approximateAgeMonths: 0 });
    vi.mocked(petsService.create).mockResolvedValue({ ...pet, birthDate: "2024-03-20" } as never);
    const next = vi.fn();
    renderWithIntl(<AgeStep onNext={next} />, "fa");
    fireEvent.click(screen.getByRole("button", { name: "ادامه" }));
    await waitFor(() => expect(next).toHaveBeenCalledWith("pet1"));
    expect(petsService.update).toHaveBeenCalledWith("pet1", { approximateAgeMonths: 0, birthDate: null });
    expect(useOnboardingStore.getState()).toMatchObject({ petId: "pet1", birthDate: null, approximateAgeMonths: 0 });
  });

  it("keeps the recovered pet id and input if reconciling a cached age fails", async () => {
    useOnboardingStore.setState({ approximateAgeMonths: 0 });
    vi.mocked(petsService.create).mockResolvedValue({ ...pet, birthDate: "2024-03-20" } as never);
    vi.mocked(petsService.update).mockRejectedValueOnce(new Error("offline"));
    const next = vi.fn();
    renderWithIntl(<AgeStep onNext={next} />, "fa");
    fireEvent.click(screen.getByRole("button", { name: "ادامه" }));
    await screen.findByText("ذخیره انجام نشد؛ اطلاعات شما حفظ شده است. دوباره تلاش کنید.");
    expect(next).not.toHaveBeenCalled();
    expect(useOnboardingStore.getState().petId).toBe("pet1");
    expect((screen.getByLabelText("سن تقریبی (ماه)") as HTMLInputElement).value).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "ادامه" }));
    await waitFor(() => expect(next).toHaveBeenCalledWith("pet1"));
    expect(petsService.create).toHaveBeenCalledTimes(1);
    expect(petsService.update).toHaveBeenCalledTimes(2);
  });

  it("clears a cached approximate age when the retry now supplies a Jalali birth date", async () => {
    vi.mocked(petsService.create).mockResolvedValue({ ...pet, approximateAgeMonths: 0 } as never);
    const next = vi.fn();
    renderWithIntl(<AgeStep onNext={next} />, "fa");
    fireEvent.change(screen.getByLabelText("سال"), { target: { value: "1403" } });
    fireEvent.change(screen.getByLabelText("ماه"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("روز"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "ادامه" }));
    await waitFor(() => expect(next).toHaveBeenCalledWith("pet1"));
    expect(petsService.update).toHaveBeenCalledWith("pet1", { birthDate: "2024-03-20", approximateAgeMonths: null });
    expect(useOnboardingStore.getState()).toMatchObject({ birthDate: "2024-03-20", approximateAgeMonths: null });
  });

});
