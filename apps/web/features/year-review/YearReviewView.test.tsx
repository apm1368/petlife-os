import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { petsService } from "@/services/pets.service";
import { petYearReviewService } from "@/services/pet-year-review.service";
import { YearReviewView } from "./YearReviewView";
import type { PetYearReviewDto } from "@petlife/types";

vi.mock("@/services/pets.service", () => ({ petsService: { getById: vi.fn() } }));
vi.mock("@/services/pet-year-review.service", () => ({ petYearReviewService: { get: vi.fn() } }));

const review: PetYearReviewDto = {
  from: "2026-01-01",
  to: "2026-12-31",
  memories: { total: 12, photos: 9, highlights: [{ id: "m1", title: "First snow", occurredAt: "2026-01-20T10:00:00.000Z" }] },
  care: { completed: 7, topTypes: [{ type: "DEWORMING", count: 4 }] },
  services: { completed: 2, byCategory: [{ category: "GROOMING", count: 2 }] },
  trips: { count: 1, destinations: ["Ramsar"] },
  health: null,
};
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
const pet = (extra: Record<string, unknown> = {}) => ({ id: "p1", name: "Cookie", species: "DOG", birthDate: null, approximateAgeMonths: 36, lifecycleStatus: "ACTIVE", ...extra });

describe("YearReviewView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(petsService.getById).mockResolvedValue(pet() as never);
    vi.mocked(petYearReviewService.get).mockResolvedValue(review);
  });

  it("shows the year's numbers, highlights and breakdowns, and leaves out sections without access", async () => {
    renderWithIntl(<YearReviewView petId="p1" />, "en");
    expect(await screen.findByText("12")).toBeTruthy();
    expect(screen.getByText("memories")).toBeTruthy();
    expect(screen.getByText("care tasks done")).toBeTruthy();
    expect(screen.queryByText("vet visits")).toBeNull();
    expect(screen.getByRole("link", { name: "First snow" }).getAttribute("href")).toBe("/en/pets/p1/memories/m1");
    expect(screen.getByText("Deworming")).toBeTruthy();
    expect(screen.getByText("Ramsar")).toBeTruthy();
    expect(screen.getByText("About 29 in human years")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add birth date" })).toBeTruthy();
  });

  it("counts down to the next birthday when a birth date is recorded", async () => {
    vi.mocked(petsService.getById).mockResolvedValue(pet({ birthDate: daysAgo(365 * 3 - 10) }) as never);
    renderWithIntl(<YearReviewView petId="p1" />, "en");
    expect(await screen.findByText(/days until turning 3/)).toBeTruthy();
  });

  it("speaks of remembrance, not birthdays, for a memorial pet", async () => {
    vi.mocked(petsService.getById).mockResolvedValue(pet({ lifecycleStatus: "MEMORIAL", birthDate: daysAgo(400) }) as never);
    renderWithIntl(<YearReviewView petId="p1" />, "en");
    expect(await screen.findByRole("heading", { name: /^Remembering Cookie in/ })).toBeTruthy();
    expect(screen.queryByText(/days until turning/)).toBeNull();
  });

  it("invites a first memory when nothing was recorded", async () => {
    vi.mocked(petYearReviewService.get).mockResolvedValue({ ...review, memories: { total: 0, photos: 0, highlights: [] }, care: { completed: 0, topTypes: [] }, services: { completed: 0, byCategory: [] }, trips: { count: 0, destinations: [] } });
    renderWithIntl(<YearReviewView petId="p1" />, "en");
    expect(await screen.findByRole("link", { name: "Add a memory" })).toBeTruthy();
  });

  it("uses the Jalali year and Persian digits in Persian", async () => {
    renderWithIntl(<YearReviewView petId="p1" />, "fa");
    expect(await screen.findByText("۱۲")).toBeTruthy();
    const [, from] = vi.mocked(petYearReviewService.get).mock.calls[0]!;
    expect(from.slice(5)).toMatch(/^03-2[01]$/);
  });
});
