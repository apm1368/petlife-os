import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { homeService } from "@/services/home.service";
import { usePetStore } from "@/stores/pet-store";
import { HomeView } from "./HomeView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/home.service", () => ({ homeService: { get: vi.fn() } }));

const ACTIVE_PET = { id: "pet-1", name: "Luna" };

function homeResponse(primaryLabelKey: string, secondary: { kind: string; labelKey: string; href: string }[] = []) {
  return {
    activePet: ACTIVE_PET,
    primaryAction: { kind: "ASK_AI", labelKey: primaryLabelKey, href: "/ai" },
    secondaryActions: secondary,
  } as never;
}

describe("HomeView", () => {
  beforeEach(() => {
    vi.mocked(homeService.get).mockReset();
    usePetStore.setState({ householdId: "h1", pets: [ACTIVE_PET as never], activePetId: "pet-1" });
  });

  /**
   * Several home action messages interpolate the pet's name ("Ask AI about
   * {name}", "View {name}'s profile"). next-intl does not fall back to the
   * raw message when a placeholder is missing — it renders the key *path*,
   * so a missing `name` surfaced the literal string "home.action.askAi" to
   * the user. askAi is HomeRankingService's default primary action, so this
   * was the most common Home state, in both locales.
   */
  it("renders the default ask-AI primary action as real copy, not a raw translation key", async () => {
    vi.mocked(homeService.get).mockResolvedValue(homeResponse("home.action.askAi"));

    renderWithIntl(<HomeView />);

    await waitFor(() => expect(screen.getByText("Ask AI about Luna")).toBeTruthy());
    expect(screen.queryByText(/home\.action\./)).toBeNull();
  });

  it("renders a name-interpolating primary action in Persian without leaking the key", async () => {
    vi.mocked(homeService.get).mockResolvedValue(homeResponse("home.action.askAi"));

    renderWithIntl(<HomeView />, "fa");

    await waitFor(() => expect(screen.getByText("پرسش از هوش مصنوعی درباره Luna")).toBeTruthy());
    expect(screen.queryByText(/home\.action\./)).toBeNull();
  });

  it("still renders a primary action that takes no placeholder", async () => {
    vi.mocked(homeService.get).mockResolvedValue(homeResponse("home.action.findVet"));

    renderWithIntl(<HomeView />);

    await waitFor(() => expect(screen.getByText("Find veterinary care")).toBeTruthy());
    expect(screen.queryByText(/home\.action\./)).toBeNull();
  });

  it("resolves a nested booking-category primary action key", async () => {
    vi.mocked(homeService.get).mockResolvedValue(homeResponse("home.action.viewBooking.grooming"));

    renderWithIntl(<HomeView />);

    await waitFor(() => expect(screen.getByText("View upcoming grooming")).toBeTruthy());
    expect(screen.queryByText(/home\.action\./)).toBeNull();
  });

  it("renders the secondary action alongside the primary one without leaking a key", async () => {
    vi.mocked(homeService.get).mockResolvedValue(
      homeResponse("home.action.askAi", [{ kind: "VIEW_PROFILE", labelKey: "home.action.viewProfile", href: "/pets/pet-1" }]),
    );

    renderWithIntl(<HomeView />);

    await waitFor(() => expect(screen.getByText("Ask AI about Luna")).toBeTruthy());
    expect(screen.getByText("View Luna's profile")).toBeTruthy();
    expect(screen.queryByText(/home\.action\./)).toBeNull();
  });
});
