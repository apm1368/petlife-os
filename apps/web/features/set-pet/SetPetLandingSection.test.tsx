import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { SetPetLandingSection } from "./SetPetLandingSection";

vi.mock("./set-pet-reel", () => ({
  setPetReel: () => ({ video: "/api/uploads/cms/media/bundle-abc.webm", poster: "/api/uploads/cms/media/bundle-abc.webp", durationS: 90, width: 1280, height: 720 }),
}));

describe("Set Pet landing reel (owner, #368 P2/P3)", () => {
  it("plays muted with a sound button, and uses the owner's CTA", () => {
    renderWithIntl(<SetPetLandingSection />, "fa");
    expect(screen.getByRole("link", { name: "ست خودت و پتت را بساز" }).getAttribute("href")).toBe("/fa/set-pet");
    // No IntersectionObserver here (as with reduced motion or Save-Data): the poster waits for a tap.
    fireEvent.click(screen.getByRole("button", { name: "پخش ویدیوی ست پت" }));
    const video = document.querySelector("video")!;
    expect(video.muted).toBe(true);
    expect(video.getAttribute("src")).toBe("/api/uploads/cms/media/bundle-abc.webm");
    const sound = screen.getByRole("button", { name: "پخش صدا" });
    fireEvent.click(sound);
    expect(screen.getByRole("button", { name: "بی‌صدا" }).getAttribute("aria-pressed")).toBe("true");
    expect(video.muted).toBe(false);
  });
});
