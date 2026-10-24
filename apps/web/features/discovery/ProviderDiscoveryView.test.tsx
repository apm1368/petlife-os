import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { discoveryService, type ProviderDiscoveryResult } from "@/services/discovery.service";
import { ProviderDiscoveryView } from "./ProviderDiscoveryView";

const params = new URLSearchParams();
const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push }), usePathname: () => "/fa/services/VET", useSearchParams: () => params }));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <span data-alt={props.alt} /> }));
vi.mock("@/services/discovery.service", () => ({ discoveryService: { search: vi.fn(), cities: vi.fn(), favorites: vi.fn(), favorite: vi.fn(), unfavorite: vi.fn() } }));
vi.mock("@/features/experience/CinematicPageHero", () => ({ CinematicPageHero: ({ title, children }: { title: string; children?: React.ReactNode }) => <div><h1>{title}</h1>{children}</div> }));

const RESULT: ProviderDiscoveryResult = {
  id: "p1", name: "کلینیک مهر", type: "VET_CLINIC", verified: true, description: null, logoUrl: null, coverImageUrl: null, specialties: [],
  location: { id: "l1", city: "تهران", region: "ونک", addressLine: "x" }, distanceKm: null,
  services: [{ id: "s1", name: "ویزیت عمومی", category: "VET", type: "GENERAL_VET_VISIT", startingPrice: 1_000_000, currency: "IRR", durationMinutes: 30, homeVisit: false, bookingMode: "INSTANT" }],
  startingPrice: 1_000_000, currency: "IRR", nextAvailableAt: null, rating: { average: null, count: 0 }, completedBookings: 0, petTypes: ["DOG"], homeVisit: false, rankingScore: 1,
};

describe("ProviderDiscoveryView", () => {
  beforeEach(() => {
    vi.mocked(discoveryService.search).mockReset();
    vi.mocked(discoveryService.cities).mockResolvedValue(["تهران"]);
    replace.mockReset();
    params.delete("sort");
  });

  it("shows real data honestly: no invented rating and explicit no-availability copy", async () => {
    vi.mocked(discoveryService.search).mockResolvedValue({ total: 1, items: [RESULT] });
    renderWithIntl(<ProviderDiscoveryView category="VET" />, "fa");
    expect(await screen.findByText("کلینیک مهر")).toBeTruthy();
    expect(screen.getByText("هنوز نظری ثبت نشده")).toBeTruthy();
    expect(screen.getByText("در ۷ روز آینده زمان آزاد ندارد")).toBeTruthy();
    expect(screen.queryByText(/۴٫۹/)).toBeNull();
    expect(vi.mocked(discoveryService.search).mock.calls[0]![0]).toMatchObject({ category: "VET", sort: "RECOMMENDED" });
  });

  it("filters are real: toggling home visit updates the URL query", async () => {
    vi.mocked(discoveryService.search).mockResolvedValue({ total: 0, items: [] });
    renderWithIntl(<ProviderDiscoveryView category="VET" />, "fa");
    fireEvent.click(await screen.findByRole("button", { name: /در منزل/ }));
    expect(replace).toHaveBeenCalledWith(expect.stringContaining("homeVisit=true"), { scroll: false });
  });

  it("offers clearing filters from the empty state", async () => {
    vi.mocked(discoveryService.search).mockResolvedValue({ total: 0, items: [] });
    renderWithIntl(<ProviderDiscoveryView category="GROOMING" />, "en");
    expect(await screen.findByText("No providers match these filters")).toBeTruthy();
  });

  it("recovers from a failed search", async () => {
    vi.mocked(discoveryService.search).mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ total: 1, items: [RESULT] });
    renderWithIntl(<ProviderDiscoveryView category="VET" />, "en");
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("کلینیک مهر")).toBeTruthy());
  });
});
