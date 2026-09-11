import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PaginatedDto, SupportNeedListingDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { supportNeedsService } from "@/services/support-needs.service";
import { ApiError } from "@/lib/api/client";
import { SupportNeedsListView } from "./SupportNeedsListView";
import { SupportNeedDetailView } from "./SupportNeedDetailView";
import { MySupportNeedsView } from "./MySupportNeedsView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/support-needs.service", () => ({
  supportNeedsService: {
    list: vi.fn(),
    listLocations: vi.fn(),
    get: vi.fn(),
    getSummary: vi.fn(),
    offerHelp: vi.fn(),
    listMine: vi.fn(),
    listOffers: vi.fn(),
    respondToOffer: vi.fn(),
    markFulfilled: vi.fn(),
    close: vi.fn(),
  },
}));

function listing(overrides: Partial<SupportNeedListingDto> = {}): SupportNeedListingDto {
  return {
    id: "listing-1",
    organizationId: null,
    organizationName: null,
    organizationVerified: false,
    creatorUserId: null,
    title: "Dog food needed",
    description: "We are caring for eight rescued dogs and have run out of food.",
    category: "FOOD" as never,
    urgency: "NORMAL" as never,
    status: "PUBLISHED" as never,
    province: "Tehran",
    city: "Tehran",
    neighborhood: null,
    latitude: null,
    longitude: null,
    imageObjectKeys: [],
    imageUrls: [],
    neededQuantity: 10,
    fulfilledQuantity: 4,
    quantityUnit: "bags",
    campaignId: null,
    contactMode: "OFFER_HELP" as never,
    animalType: null,
    reviewNote: null,
    publishedAt: "2026-02-01T00:00:00.000Z",
    fulfilledAt: null,
    closedAt: null,
    expiresAt: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
    ...overrides,
  };
}

function paginated(items: SupportNeedListingDto[]): PaginatedDto<SupportNeedListingDto> {
  return { items, total: items.length, page: 1, pageSize: 50 } as PaginatedDto<SupportNeedListingDto>;
}

describe("SupportNeedsListView", () => {
  beforeEach(() => {
    vi.mocked(supportNeedsService.list).mockReset();
    vi.mocked(supportNeedsService.listLocations).mockReset();
    vi.mocked(supportNeedsService.listLocations).mockResolvedValue([{ province: "Tehran", city: "Tehran" }]);
  });

  it("renders a dense row per listing with category, city and fulfillment progress", async () => {
    vi.mocked(supportNeedsService.list).mockResolvedValue(paginated([listing()]));
    renderWithIntl(<SupportNeedsListView />);

    await waitFor(() => expect(screen.getByText("Dog food needed")).toBeTruthy());
    expect(screen.getByText(/Food · Tehran/)).toBeTruthy();
    expect(screen.getByText("4 of 10 bags covered")).toBeTruthy();
  });

  it("pushes the category filter to the API rather than filtering locally", async () => {
    vi.mocked(supportNeedsService.list).mockResolvedValue(paginated([listing()]));
    renderWithIntl(<SupportNeedsListView />);
    await waitFor(() => expect(screen.getByLabelText("Category")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "TRANSPORT" } });
    await waitFor(() => expect(supportNeedsService.list).toHaveBeenCalledWith(expect.objectContaining({ category: "TRANSPORT" })));
  });

  it("shows an urgency badge only above NORMAL, keeping the board calm", async () => {
    vi.mocked(supportNeedsService.list).mockResolvedValue(paginated([listing(), listing({ id: "listing-2", title: "Emergency surgery", urgency: "CRITICAL" as never })]));
    renderWithIntl(<SupportNeedsListView />);

    await waitFor(() => expect(screen.getByText("Emergency surgery")).toBeTruthy());
    // "Critical" also exists as an option in the urgency filter, so count only the
    // rendered badges: exactly one listing carries one, and NORMAL never does.
    const badges = screen.getAllByText("Critical").filter((el) => el.tagName !== "OPTION");
    expect(badges).toHaveLength(1);
    expect(screen.queryAllByText("Normal").filter((el) => el.tagName !== "OPTION")).toHaveLength(0);
  });

  it("offers category shortcuts and a publish CTA instead of a dead empty list", async () => {
    vi.mocked(supportNeedsService.list).mockResolvedValue(paginated([]));
    renderWithIntl(<SupportNeedsListView />);

    await waitFor(() => expect(screen.getByText("No needs match these filters yet.")).toBeTruthy());
    expect(screen.getByText("Browse by category instead:")).toBeTruthy();
    expect(screen.getAllByText("Post a need").length).toBeGreaterThan(0);
  });
});

describe("SupportNeedDetailView", () => {
  beforeEach(() => {
    vi.mocked(supportNeedsService.get).mockReset();
    vi.mocked(supportNeedsService.getSummary).mockReset();
    vi.mocked(supportNeedsService.offerHelp).mockReset();
    vi.mocked(supportNeedsService.getSummary).mockResolvedValue({
      listingId: "listing-1",
      neededQuantity: 10,
      fulfilledQuantity: 4,
      pendingOffers: 1,
      acceptedOffers: 0,
      completedOffers: 2,
    });
  });

  it("explains that contact stays inside the product and never shows a phone number", async () => {
    vi.mocked(supportNeedsService.get).mockResolvedValue(listing());
    renderWithIntl(<SupportNeedDetailView listingId="listing-1" />);

    await waitFor(() => expect(screen.getByText("Offer help")).toBeTruthy());
    expect(screen.getByText(/never shown publicly/)).toBeTruthy();
  });

  it("sends an offer and confirms it", async () => {
    vi.mocked(supportNeedsService.get).mockResolvedValue(listing());
    vi.mocked(supportNeedsService.offerHelp).mockResolvedValue({ id: "offer-1" } as never);

    renderWithIntl(<SupportNeedDetailView listingId="listing-1" />);
    await waitFor(() => expect(screen.getByLabelText("Message")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "I can bring four bags." } });
    fireEvent.click(screen.getByText("Send offer"));

    await waitFor(() => expect(supportNeedsService.offerHelp).toHaveBeenCalledWith("listing-1", expect.objectContaining({ message: "I can bring four bags." })));
    await waitFor(() => expect(screen.getByText("Your offer has been sent to the publisher.")).toBeTruthy());
  });

  it("prompts an anonymous visitor to sign in rather than showing a raw error", async () => {
    vi.mocked(supportNeedsService.get).mockResolvedValue(listing());
    vi.mocked(supportNeedsService.offerHelp).mockRejectedValue(
      new ApiError({ code: "CSRF_TOKEN_INVALID", message: "Missing or invalid CSRF token.", requestId: "r1" }, 403),
    );

    renderWithIntl(<SupportNeedDetailView listingId="listing-1" />);
    await waitFor(() => expect(screen.getByLabelText("Message")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "I can help with this." } });
    fireEvent.click(screen.getByText("Send offer"));

    await waitFor(() => expect(screen.getByText("Sign in to offer help")).toBeTruthy());
  });

  it("points a money-accepting listing at its linked campaign instead of collecting funds itself", async () => {
    vi.mocked(supportNeedsService.get).mockResolvedValue(listing({ contactMode: "DONATE" as never, campaignId: "campaign-9" }));
    renderWithIntl(<SupportNeedDetailView listingId="listing-1" />);

    await waitFor(() => expect(screen.getByText("Go to the campaign")).toBeTruthy());
    expect(screen.getByText("Go to the campaign").closest("a")?.getAttribute("href")).toBe("/animal-support/campaigns/campaign-9");
    // A donate-only listing shows no help-offer form.
    expect(screen.queryByLabelText("Message")).toBeNull();
  });
});

describe("MySupportNeedsView", () => {
  beforeEach(() => {
    vi.mocked(supportNeedsService.listMine).mockReset();
    vi.mocked(supportNeedsService.listOffers).mockReset();
    vi.mocked(supportNeedsService.respondToOffer).mockReset();
  });

  it("asks an anonymous visitor to sign in instead of erroring", async () => {
    vi.mocked(supportNeedsService.listMine).mockRejectedValue(new ApiError({ code: "UNAUTHENTICATED", message: "no", requestId: "r1" }, 401));
    renderWithIntl(<MySupportNeedsView />);

    await waitFor(() => expect(screen.getByText("Sign in to see the needs you have posted.")).toBeTruthy());
  });

  it("shows the moderator's note on a rejected listing", async () => {
    vi.mocked(supportNeedsService.listMine).mockResolvedValue(
      paginated([listing({ status: "REJECTED" as never, reviewNote: "Please describe exactly what you need.", creatorUserId: "user-1" })]),
    );
    renderWithIntl(<MySupportNeedsView />);

    await waitFor(() => expect(screen.getByText("Moderator note: Please describe exactly what you need.")).toBeTruthy());
    // "Needs changes" is also a status tab, so assert on the badge rather than the button.
    expect(screen.getAllByText("Needs changes").filter((el) => el.closest("button") === null)).toHaveLength(1);
  });

  it("loads the offer inbox on demand and accepts an offer", async () => {
    vi.mocked(supportNeedsService.listMine).mockResolvedValue(paginated([listing({ creatorUserId: "user-1" })]));
    vi.mocked(supportNeedsService.listOffers).mockResolvedValue([
      { id: "offer-1", listingId: "listing-1", helperUserId: "helper-1", message: "I can bring four bags.", helpType: "FOOD" as never, quantity: 4, status: "PENDING" as never, fulfilledQuantity: null, respondedAt: null, createdAt: "2026-02-01T00:00:00.000Z", updatedAt: "2026-02-01T00:00:00.000Z" },
    ]);
    vi.mocked(supportNeedsService.respondToOffer).mockResolvedValue({ id: "offer-1" } as never);

    renderWithIntl(<MySupportNeedsView />);
    await waitFor(() => expect(screen.getByText("View offers")).toBeTruthy());

    fireEvent.click(screen.getByText("View offers"));
    await waitFor(() => expect(screen.getByText("I can bring four bags.")).toBeTruthy());

    fireEvent.click(screen.getByText("Accept"));
    await waitFor(() => expect(supportNeedsService.respondToOffer).toHaveBeenCalledWith("listing-1", "offer-1", { status: "ACCEPTED" }));
  });

  it("filters by status tab", async () => {
    vi.mocked(supportNeedsService.listMine).mockResolvedValue(paginated([listing({ creatorUserId: "user-1" })]));
    renderWithIntl(<MySupportNeedsView />);
    await waitFor(() => expect(screen.getByText("In review")).toBeTruthy());

    fireEvent.click(screen.getByText("In review"));
    await waitFor(() => expect(supportNeedsService.listMine).toHaveBeenCalledWith(expect.objectContaining({ status: "PENDING_REVIEW" })));
  });
});
