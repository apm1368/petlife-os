import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { AnimalSupportOrganizationDto, PaginatedDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { animalSupportService } from "@/services/animal-support.service";
import { AnimalSupportOrganizationListView } from "./AnimalSupportOrganizationListView";

vi.mock("@/services/animal-support.service", () => ({ animalSupportService: { listOrganizations: vi.fn() } }));

function org(overrides: Partial<AnimalSupportOrganizationDto> = {}): AnimalSupportOrganizationDto {
  return {
    id: "org-1",
    type: "SHELTER" as never,
    name: "Paws Rescue",
    description: null,
    location: "Tehran",
    latitude: null,
    longitude: null,
    verificationStatus: "VERIFIED" as never,
    contactEmail: null,
    contactPhone: null,
    logoObjectKey: null,
    logoUrl: null,
    imageObjectKeys: [],
    imageUrls: [],
    isPubliclyListed: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function page(items: AnimalSupportOrganizationDto[]): PaginatedDto<AnimalSupportOrganizationDto> {
  return { items, total: items.length, page: 1, pageSize: 20 };
}

describe("AnimalSupportOrganizationListView", () => {
  beforeEach(() => {
    vi.mocked(animalSupportService.listOrganizations).mockReset();
  });

  it("shows verified organizations once loaded", async () => {
    vi.mocked(animalSupportService.listOrganizations).mockResolvedValue(page([org()]));

    renderWithIntl(<AnimalSupportOrganizationListView />);

    await waitFor(() => expect(screen.getByText("Paws Rescue")).toBeTruthy());
    expect(screen.getByText("Verified")).toBeTruthy();
    expect(screen.getByText("Tehran")).toBeTruthy();
  });

  it("shows a localized empty state when there are no organizations", async () => {
    vi.mocked(animalSupportService.listOrganizations).mockResolvedValue(page([]));

    renderWithIntl(<AnimalSupportOrganizationListView />);

    await waitFor(() => expect(screen.getByText("No organizations listed yet.")).toBeTruthy());
  });
});
