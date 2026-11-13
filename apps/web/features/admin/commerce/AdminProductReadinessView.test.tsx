import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { AdminProductReadinessDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminCommerceService } from "@/services/admin-commerce.service";
import { ApiError } from "@/lib/api/client";
import { AdminProductReadinessView } from "./AdminProductReadinessView";

vi.mock("@/services/admin-commerce.service", () => ({ adminCommerceService: { productReadiness: vi.fn() } }));

const DATA: AdminProductReadinessDto = {
  items: [
    { id: "p1", title: "Cat food", status: "ACTIVE", isDemoRecord: false, categoryName: "Food", brandName: null, mediaCount: 2, mediaWithoutAlt: 0, meetsPublishRule: false, offers: 1, liveOffers: 0, issues: ["MEDIA_INCOMPLETE", "MISSING_BRAND", "NO_LIVE_OFFER"], updatedAt: "2026-11-13T10:00:00Z" },
  ],
  total: 1,
  page: 1,
  pageSize: 30,
  counts: { ANY: 1, MEDIA_INCOMPLETE: 1, MISSING_BRAND: 1, MISSING_SPECS: 0, UNREVIEWED_SOURCE: 0, NO_LIVE_OFFER: 1 },
};

describe("AdminProductReadinessView", () => {
  beforeEach(() => {
    vi.mocked(adminCommerceService.productReadiness).mockReset();
  });

  it("lists each product with every reason it is not ready, and links to the product", async () => {
    vi.mocked(adminCommerceService.productReadiness).mockResolvedValue(DATA);
    renderWithIntl(<AdminProductReadinessView />);
    await screen.findByRole("link", { name: "Cat food" });
    expect(screen.getByRole("link", { name: "Cat food" }).getAttribute("href")).toBe("/en/admin/commerce/products/p1");
    expect(screen.getByText("Images incomplete", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("No brand", { selector: "span" })).toBeTruthy();
    expect(screen.getByText(/2 of 3 images · 0 without alt text · publishing blocked · 0 live offers of 1/)).toBeTruthy();
    expect(screen.getByRole("tab", { name: "All problems (1)" }).getAttribute("aria-selected")).toBe("true");
  });

  it("filters by problem and shows the server's error instead of an empty list", async () => {
    vi.mocked(adminCommerceService.productReadiness).mockResolvedValueOnce(DATA).mockRejectedValueOnce(new ApiError({ code: "INTERNAL", message: "boom", requestId: "r" }, 500));
    renderWithIntl(<AdminProductReadinessView />);
    await screen.findByRole("link", { name: "Cat food" });
    fireEvent.click(screen.getByRole("tab", { name: /No live offer/ }));
    await waitFor(() => expect(adminCommerceService.productReadiness).toHaveBeenLastCalledWith(expect.objectContaining({ issue: "NO_LIVE_OFFER", page: 1 })));
    await screen.findByText("Could not load the readiness queue");
    expect(screen.queryByText("Every product is ready to sell.")).toBeNull();
  });

  it("renders in Arabic", async () => {
    vi.mocked(adminCommerceService.productReadiness).mockResolvedValue(DATA);
    renderWithIntl(<AdminProductReadinessView />, "ar");
    await screen.findByText("منتجات غير مكتملة", { selector: "h1" });
    expect(screen.getByText("صور غير مكتملة", { selector: "span" })).toBeTruthy();
  });
});
