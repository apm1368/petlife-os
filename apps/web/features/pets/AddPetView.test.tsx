import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { petsService } from "@/services/pets.service";
import { usePetStore } from "@/stores/pet-store";
import { AddPetView } from "./AddPetView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/fa/pets/new" }));
vi.mock("@/services/pets.service", () => ({ petsService: { create: vi.fn(), createPhotoUploadUrl: vi.fn(), update: vi.fn() } }));

describe("AddPetView", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(petsService.create).mockReset().mockResolvedValue({ id: "pet-9", name: "Pistachio" } as never);
    usePetStore.setState({ householdId: "h1", pets: [], activePetId: "pet-1" });
  });

  it("offers the common household species, in Persian only on a Persian page", () => {
    renderWithIntl(<AddPetView />, "fa");
    for (const label of ["سگ", "گربه", "پرنده", "خرگوش", "ماهی", "خزنده", "سایر"]) expect(screen.getByRole("button", { name: new RegExp(label) })).toBeTruthy();
    const ui = document.body.textContent!.replace(/JPG|PNG|WebP/g, "");
    expect(ui).not.toMatch(/[A-Za-z]/);
  });

  it("requires a name but lets an unknown age continue", () => {
    renderWithIntl(<AddPetView />, "en");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert").textContent).toBe("Enter the pet's name.");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Pistachio" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/This step is optional/)).toBeTruthy();
  });

  it("saves an unknown age without inventing a date or zero-month age", async () => {
    renderWithIntl(<AddPetView />, "en");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Unknown age" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip and save" }));
    await waitFor(() => expect(petsService.create).toHaveBeenCalledTimes(1));
    expect(vi.mocked(petsService.create).mock.calls[0]![1]).toEqual({ name: "Unknown age", species: "DOG" });
  });

  it("creates the pet once with species, sex, approximate age and breed, then opens its profile", async () => {
    renderWithIntl(<AddPetView />, "en");
    fireEvent.click(screen.getByRole("button", { name: /Rabbit/ }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Pistachio" } });
    fireEvent.click(screen.getByRole("button", { name: "Female" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByLabelText(/approximate age/));
    fireEvent.change(screen.getByLabelText("Years"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Months"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Breed"), { target: { value: "Lop" } });
    fireEvent.click(screen.getByRole("button", { name: "Skip and save" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/pets/pet-9"));
    expect(petsService.create).toHaveBeenCalledTimes(1);
    expect(vi.mocked(petsService.create).mock.calls[0]![1]).toEqual({ name: "Pistachio", species: "RABBIT", sex: "FEMALE", approximateAgeMonths: 27, breed: "Lop" });
    expect(petsService.createPhotoUploadUrl).not.toHaveBeenCalled();
  });
  it("keeps an explicitly entered Persian zero-month age instead of treating it as unknown", async () => {
    renderWithIntl(<AddPetView />, "fa");
    fireEvent.change(screen.getByLabelText("نام"), { target: { value: "کوچولو" } });
    fireEvent.click(screen.getByRole("button", { name: "ادامه" }));
    fireEvent.click(screen.getByLabelText(/تاریخ دقیق را نمی‌دانم/));
    fireEvent.change(screen.getByLabelText("ماه"), { target: { value: "۰" } });
    fireEvent.click(screen.getByRole("button", { name: "رد کردن و ذخیره" }));
    await waitFor(() => expect(petsService.create).toHaveBeenCalledTimes(1));
    expect(vi.mocked(petsService.create).mock.calls[0]![1]).toEqual({ name: "کوچولو", species: "DOG", approximateAgeMonths: 0 });
  });

});
