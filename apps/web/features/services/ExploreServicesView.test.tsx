import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ExploreServicesView } from "./ExploreServicesView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-active-pet", () => ({ useActivePet: () => ({ activePet: { id: "pet-1", name: "Luna" } }) }));

describe("ExploreServicesView", () => {
  it("shows a tile for every service category and the active pet's name", () => {
    renderWithIntl(<ExploreServicesView />);

    expect(screen.getByText("For Luna")).toBeTruthy();
    expect(screen.getByText("Grooming")).toBeTruthy();
    expect(screen.getByText("Training")).toBeTruthy();
    expect(screen.getByText("Walking")).toBeTruthy();
    expect(screen.getByText("Sitting")).toBeTruthy();
    expect(screen.getByText("Boarding")).toBeTruthy();
    expect(screen.getByText("Pet Taxi")).toBeTruthy();
  });
});
