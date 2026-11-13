import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { placeSuggestionsService, type PlaceSuggestionDto } from "@/services/place-suggestions.service";
import { PlaceSuggestView } from "./PlaceSuggestView";

vi.mock("@/services/place-suggestions.service", () => ({ placeSuggestionsService: { suggest: vi.fn(), mine: vi.fn(), photoUploadUrl: vi.fn() } }));
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
  Object.assign(URL, { createObjectURL: vi.fn((f: File) => `blob:${f.name}`), revokeObjectURL: vi.fn() });
  let n = 0;
  svc.photoUploadUrl.mockImplementation(async () => ({ uploadUrl: `/api/uploads/p${++n}`, method: "PUT", headers: { "Content-Type": "image/png" }, expiresInSeconds: 600, key: `place-suggestions/u1/k${n}.png`, maxBytes: 10485760 }));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());
const pickPhotos = (files: File[]) => fireEvent.change(document.querySelector('.place-suggest__add-photo input')!, { target: { files } });

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
    const mine = await screen.findByRole("region", { name: "پیشنهادهای شما" });
    expect(within(mine).getAllByRole("listitem")).toHaveLength(2);
    expect(within(mine).getByRole("link", { name: "دیدن مکان" }).getAttribute("href")).toBe("/fa/places/p9");
    expect(within(mine).getByText("Closed last year")).toBeTruthy();
    expect(within(mine).getByText("اضافه نشد")).toBeTruthy();
  });

  it("adds up to three photos with a local preview, uploads them on send and passes only their keys (owner #6)", async () => {
    svc.suggest.mockResolvedValue(row({ photoCount: 1 }));
    renderWithIntl(<PlaceSuggestView />, "en");
    fill();
    expect(screen.getByText(/They stay private and their location and camera data are removed/)).toBeTruthy();
    pickPhotos([new File(["<svg/>"], "drawing.svg", { type: "image/svg+xml" }), new File(["png"], "park.png", { type: "image/png" })]);
    // SVG and other non-photos are refused before anything is uploaded; the PNG gets a local preview.
    expect(screen.getByText("Only JPG, PNG or WebP photos are accepted.")).toBeTruthy();
    expect(screen.getByAltText("park.png").getAttribute("src")).toBe("blob:park.png");
    fireEvent.click(screen.getByRole("button", { name: "Send suggestion" }));
    await waitFor(() => expect(svc.suggest).toHaveBeenCalled());
    expect(svc.photoUploadUrl).toHaveBeenCalledWith({ contentType: "image/png", fileSizeBytes: 3 });
    expect(fetch).toHaveBeenCalledWith("/api/uploads/p1", expect.objectContaining({ method: "PUT", credentials: "omit" }));
    expect(svc.suggest.mock.calls[0]![0]).toMatchObject({ name: "Laleh Park", photoObjectKeys: ["place-suggestions/u1/k1.png"] });
    expect(await screen.findByText(/1 photo/)).toBeTruthy();
  });

  it("removes a picked photo and never sends it", async () => {
    svc.suggest.mockResolvedValue(row({}));
    renderWithIntl(<PlaceSuggestView />, "en");
    fill();
    pickPhotos([new File(["png"], "park.png", { type: "image/png" })]);
    fireEvent.click(screen.getByRole("button", { name: "Remove park.png" }));
    expect(screen.queryByAltText("park.png")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send suggestion" }));
    await waitFor(() => expect(svc.suggest).toHaveBeenCalled());
    expect(svc.photoUploadUrl).not.toHaveBeenCalled();
    expect(svc.suggest.mock.calls[0]![0]).not.toHaveProperty("photoObjectKeys");
  });

  it("explains a file the server rejects as not a photo, and sends nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 415 })));
    renderWithIntl(<PlaceSuggestView />, "en");
    fill();
    pickPhotos([new File(["x"], "fake.png", { type: "image/png" })]);
    fireEvent.click(screen.getByRole("button", { name: "Send suggestion" }));
    expect((await screen.findByRole("alert")).textContent).toBe("One of the files isn't a photo. Please choose another.");
    expect(svc.suggest).not.toHaveBeenCalled();
  });

  it("caps photos at three", () => {
    renderWithIntl(<PlaceSuggestView />, "en");
    pickPhotos([1, 2, 3, 4].map((i) => new File(["p"], `p${i}.png`, { type: "image/png" })));
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(screen.getByText("You can add up to 3 photos.")).toBeTruthy();
    expect(document.querySelector(".place-suggest__add-photo")).toBeNull();
  });
});
