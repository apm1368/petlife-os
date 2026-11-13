import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminCommerceService } from "@/services/admin-commerce.service";
import { DigikalaFactsImportPanel } from "./DigikalaFactsImportPanel";

vi.mock("@/services/admin-commerce.service", () => ({ adminCommerceService: { startDigikalaFactsImport: vi.fn() } }));

const categories = [{ id: "cat-pet", name: "Pet supplies" }];

describe("DigikalaFactsImportPanel", () => {
  beforeEach(() => vi.mocked(adminCommerceService.startDigikalaFactsImport).mockReset().mockResolvedValue({ id: "job-1", status: "QUEUED" }));

  it("says what is and is not imported, and starts the one-time run", async () => {
    const onStarted = vi.fn();
    renderWithIntl(<DigikalaFactsImportPanel categories={categories} jobs={[]} onStarted={onStarted} />, "en");
    expect(screen.getByText(/photos and descriptions are not copied/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Maximum products (up to 3000)"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Start the one-time import" }));
    await waitFor(() => expect(adminCommerceService.startDigikalaFactsImport).toHaveBeenCalledWith(expect.objectContaining({ categoryId: "cat-pet", maxProducts: 500 })));
    expect(onStarted).toHaveBeenCalled();
  });

  it("offers no second run once the import has run", () => {
    renderWithIntl(<DigikalaFactsImportPanel categories={categories} jobs={[{ mode: "DIGIKALA_FACTS", status: "COMPLETED" }]} onStarted={vi.fn()} />, "fa");
    expect(screen.getByText("این واردسازی یک بار اجرا شده یا در حال اجراست.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
