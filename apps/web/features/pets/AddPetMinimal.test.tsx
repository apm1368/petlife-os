import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { usePetStore } from "@/stores/pet-store";
import { petsService } from "@/services/pets.service";
import { AddPetView } from "./AddPetView";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/pets.service", () => ({ petsService: { create: vi.fn() } }));

describe("minimal pet creation from the identity step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePetStore.setState({ householdId: "h1", pets: [], activePetId: null });
    vi.mocked(petsService.create).mockResolvedValue({ id: "p1", name: "کوکی", species: "CAT" } as never);
  });

  it("saves from the first step with only name and species and an ASCII request header", async () => {
    renderWithIntl(<AddPetView />, "fa");
    fireEvent.change(screen.getByLabelText("نام"), { target: { value: "کوکی" } });
    fireEvent.click(screen.getByRole("button", { name: "گربه" }));
    fireEvent.click(screen.getByRole("button", { name: "ذخیرهٔ حیوان" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/fa/pets/p1"));
    const [household, body, key] = vi.mocked(petsService.create).mock.calls[0]!;
    expect(household).toBe("h1");
    expect(body).toEqual({ name: "کوکی", species: "CAT" });
    expect(() => new Headers({ "Idempotency-Key": key! })).not.toThrow();
  });

  it("links the Persian required-name error to its field without calling the API", () => {
    renderWithIntl(<AddPetView />, "fa");
    fireEvent.click(screen.getByRole("button", { name: "ذخیرهٔ حیوان" }));
    expect(screen.getByRole("alert").textContent).toBe("نام حیوان را بنویسید.");
    expect(screen.getByLabelText("نام").getAttribute("aria-invalid")).toBe("true");
    expect(petsService.create).not.toHaveBeenCalled();
  });

  it("keeps the entered name visible and reports a failed save in Persian", async () => {
    vi.mocked(petsService.create).mockRejectedValue(new Error("offline"));
    renderWithIntl(<AddPetView />, "fa");
    fireEvent.change(screen.getByLabelText("نام"), { target: { value: "کوکی" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیرهٔ حیوان" }));
    expect((await screen.findByRole("alert")).textContent).toContain("ثبت حیوان انجام نشد");
    expect((screen.getByLabelText("نام") as HTMLInputElement).value).toBe("کوکی");
    expect(push).not.toHaveBeenCalled();
  });
});
