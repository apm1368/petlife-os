import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { useSessionStore } from "@/stores/session-store";
import { FoundByNeighbours, LostPetAreaAlertCard } from "./LostPetNeighbourhood";

const getAreaAlert = vi.fn();
const setAreaAlert = vi.fn();
const removeAreaAlert = vi.fn();
const listPosts = vi.fn();
vi.mock("@/services/lost-pet.service", () => ({ lostPetService: { getAreaAlert: () => getAreaAlert(), setAreaAlert: (i: unknown) => setAreaAlert(i), removeAreaAlert: () => removeAreaAlert() } }));
vi.mock("@/services/community.service", () => ({ communityService: { listPosts: (i: unknown) => listPosts(i) } }));

describe("lost-pet neighbourhood (#290 Q53/Q54)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("asks a signed-out visitor to sign in and returns them to the lost-pets page", () => {
    useSessionStore.setState({ status: "unauthenticated" });
    renderWithIntl(<LostPetAreaAlertCard />, "en");
    expect(screen.getByRole("link", { name: "Sign in to turn on alerts" }).getAttribute("href")).toBe("/en/welcome?returnTo=%2Fen%2Flost-pets");
    expect(getAreaAlert).not.toHaveBeenCalled();
  });

  it("turns the alert on from the browser position with the chosen radius, then off", async () => {
    useSessionStore.setState({ status: "authenticated" });
    getAreaAlert.mockResolvedValue({ active: false, radiusKm: null });
    setAreaAlert.mockResolvedValue({ active: true, radiusKm: 5 });
    removeAreaAlert.mockResolvedValue({ active: false, radiusKm: null });
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 35.7, longitude: 51.4 } }) } });
    renderWithIntl(<LostPetAreaAlertCard />, "de");
    await waitFor(() => expect(getAreaAlert).toHaveBeenCalled());
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Hinweise einschalten" }));
    await waitFor(() => expect(setAreaAlert).toHaveBeenCalledWith({ latitude: 35.7, longitude: 51.4, radiusKm: 5 }));
    expect(await screen.findByText("An: Sie erfahren von Meldungen im Umkreis von 5 km.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ausschalten" }));
    await waitFor(() => expect(removeAreaAlert).toHaveBeenCalled());
  });

  it("lists found-pet posts and links to posting one", async () => {
    listPosts.mockResolvedValue({ items: [{ id: "p1", title: "Grey cat near Tajrish", body: "Friendly, blue collar." }], total: 1, page: 1, pageSize: 6 });
    renderWithIntl(<FoundByNeighbours />, "fa");
    expect(listPosts).toHaveBeenCalledWith({ type: "FOUND_PET", pageSize: 6 });
    expect((await screen.findByRole("link", { name: /Grey cat near Tajrish/ })).getAttribute("href")).toBe("/fa/community/posts/p1");
    expect(screen.getByRole("link", { name: "حیوانی پیدا کرده‌ام" }).getAttribute("href")).toBe("/fa/community/new?type=FOUND_PET");
  });
});
