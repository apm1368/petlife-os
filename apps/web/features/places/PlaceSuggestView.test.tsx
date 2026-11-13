import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { placeSuggestionsService, type PlaceSuggestionDto } from "@/services/place-suggestions.service";
import { PlaceSuggestView } from "./PlaceSuggestView";

vi.mock("@/services/place-suggestions.service", () => ({ placeSuggestionsService: { suggest: vi.fn(), mine: vi.fn() } }));
vi.mock("@/features/maps/MapView", () => ({
  MapView: ({ onPick, label }: { onPick?: (p: { latitude: number; longitude: number }) => void; label: string }) => (
    <button type="button" aria-label={label} onClick={() => onPick?.({ latitude: 35.70123456, longitude: 51.40987654 })}>map</button>
  ),
}));
const svc = vi.mocked(placeSuggestionsService);
const row = (patch: Partial<PlaceSuggestionDto>): PlaceSuggestionDto => ({ id: "s1", kind: "NEW_PLACE", placeId: null, name: "Laleh Park", category: "PARK" as never, city: "Tehran", address: null, latitude: 35.7, longitude: 51.4, notes: null, status: "PENDING", reviewNote: null, createdPlaceId: null, createdAt: "2026-11-13T10:00:00Z", ...patch });

beforeEach(() => {
  vi.clearAllMocks();
  svc.mine.mockResolvedValue([]);
});

const fill = () => {
  fireEvent.change(screen.getByLabelText("Place name"), { target: { value: "  Laleh Park " } });
  fireEvent.change(screen.getByLabelText(/^Category/), { target: { value: "PARK" } });
  fireEvent.change(screen.getByLabelText("City"), { target: { value: "Tehran" } });
  fireEvent.click(screen.getByRole("button", { name: "Map: tap to place the pin" }));
};

describe("suggest a place (owner, 2026-11-13)", () => {
  it("asks for the name, category, city and the map pin before sending anything", async () => {
    renderWithIntl(<PlaceSuggestView />, "en");
    fireEvent.click(screen.getByRole("button", { name: "Send suggestion" }));
    expect(screen.getAllByText("Required")).toHaveLength(3);
    expect(screen.getByText("Place the pin on the map: our team needs the location to list the place.")).toBeTruthy();
    expect(svc.suggest).not.toHaveBeenCalled();
  });

  it("sends a clean suggestion and says it is under review", async () => {
    svc.suggest.mockResolvedValue(row({}));
    renderWithIntl(<PlaceSuggestView />, "en");
    fill();
    expect(screen.getByText("Pin placed")).toBeTruthy();
    expect(screen.getByText(/these notes may be shown publicly/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send suggestion" }));
    await waitFor(() => expect(svc.suggest).toHaveBeenCalledWith({ name: "Laleh Park", category: "PARK", city: "Tehran", latitude: 35.701235, longitude: 51.409877 }));
    expect(await screen.findByRole("heading", { name: "Thanks! Your suggestion is under review" })).toBeTruthy();
    const mine = screen.getByRole("region", { name: "Your suggestions" });
    expect(within(mine).getByText("Under review")).toBeTruthy();
  });

  it.each([
    [new ApiError({ code: "VALIDATION_ERROR", message: "x", requestId: "r", details: { reason: "TOO_MANY_PENDING_SUGGESTIONS", max: 10 } }, 400), "You already have 10 suggestions waiting for review. Please wait until some are reviewed."],
    [new ApiError({ code: "TOO_MANY_REQUESTS", message: "x", requestId: "r" }, 429), "Too many tries in a short time. Please wait a minute and try again."],
  ])("explains a refusal in plain words", async (error, text) => {
    svc.suggest.mockRejectedValue(error);
    renderWithIntl(<PlaceSuggestView />, "en");
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Send suggestion" }));
    expect((await screen.findByRole("alert")).textContent).toBe(text);
  });

  it("lists the member's suggestions with what happened to them", async () => {
    svc.mine.mockResolvedValue([row({ id: "a", status: "APPROVED", createdPlaceId: "p9" }), row({ id: "b", name: "Cafe Roshan", status: "REJECTED", reviewNote: "Closed last year" }), row({ id: "c", kind: "CORRECTION" })]);
    renderWithIntl(<PlaceSuggestView />, "fa");
    const mine = await screen.findByRole("region", { name: "پیشنهادهای تو" });
    expect(within(mine).getAllByRole("listitem")).toHaveLength(2);
    expect(within(mine).getByRole("link", { name: "دیدن مکان" }).getAttribute("href")).toBe("/fa/places/p9");
    expect(within(mine).getByText("Closed last year")).toBeTruthy();
    expect(within(mine).getByText("اضافه نشد")).toBeTruthy();
  });
});
