import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { petsService } from "@/services/pets.service";
import { PetContextShell } from "./PetContextShell";

vi.mock("next/navigation", () => ({ usePathname: () => "/en/pets/p1", useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/services/pets.service", () => ({ petsService: { getById: vi.fn(), getMyAccess: vi.fn() } }));

const denied = (details?: Record<string, unknown>) => new ApiError({ code: "PET_ACCESS_DENIED", message: "You do not have access to this pet.", details, requestId: "r" }, 403);

describe("PetContextShell access states", () => {
  it("an expired temporary grant says the access ended — and shows nothing about the pet", async () => {
    vi.mocked(petsService.getById).mockRejectedValue(denied({ petId: "p1", lapse: { reason: "EXPIRED", at: "2026-09-29T00:00:00Z" } }));
    vi.mocked(petsService.getMyAccess).mockRejectedValue(denied());
    renderWithIntl(<PetContextShell petId="p1">child</PetContextShell>, "en");
    expect(await screen.findByRole("heading", { name: "Your access has ended" })).toBeTruthy();
    expect(screen.queryByText("child")).toBeNull();
  });

  it("a revoked grant and a stranger get different, safe explanations", async () => {
    vi.mocked(petsService.getById).mockRejectedValue(denied({ petId: "p1", lapse: { reason: "REVOKED" } }));
    vi.mocked(petsService.getMyAccess).mockRejectedValue(denied());
    const { unmount } = renderWithIntl(<PetContextShell petId="p1">child</PetContextShell>, "fa");
    expect(await screen.findByRole("heading", { name: "دسترسی شما برداشته شده است" })).toBeTruthy();
    unmount();
    vi.mocked(petsService.getById).mockRejectedValue(denied({ petId: "p1" }));
    renderWithIntl(<PetContextShell petId="p1">child</PetContextShell>, "en");
    expect(await screen.findByRole("heading", { name: "You don't have access to this" })).toBeTruthy();
  });

  it("a missing pet is a 404 state", async () => {
    vi.mocked(petsService.getById).mockRejectedValue(new ApiError({ code: "NOT_FOUND", message: "Pet not found.", requestId: "r" }, 404));
    vi.mocked(petsService.getMyAccess).mockRejectedValue(new ApiError({ code: "NOT_FOUND", message: "Pet not found.", requestId: "r" }, 404));
    renderWithIntl(<PetContextShell petId="p1">child</PetContextShell>, "en");
    expect(await screen.findByRole("heading", { name: "We couldn't find that page" })).toBeTruthy();
  });
});
