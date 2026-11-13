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
    expect((screen.getByLabelText("Total products (up to 16,000)") as HTMLInputElement).value).toBe("16000");
    fireEvent.change(screen.getByLabelText("Total products (up to 16,000)"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Start the one-time import" }));
    await waitFor(() => expect(adminCommerceService.startDigikalaFactsImport).toHaveBeenCalledWith(expect.objectContaining({ categoryId: "cat-pet", maxProducts: 500 })));
    expect(onStarted).toHaveBeenCalled();
  });

  it("refuses more than the one-time total", async () => {
    renderWithIntl(<DigikalaFactsImportPanel categories={categories} jobs={[]} onStarted={vi.fn()} />, "en");
    fireEvent.change(screen.getByLabelText("Total products (up to 16,000)"), { target: { value: "20000" } });
    fireEvent.click(screen.getByRole("button", { name: "Start the one-time import" }));
    expect(await screen.findByText("Choose a category and a number from 1 to 16,000.")).toBeTruthy();
    expect(adminCommerceService.startDigikalaFactsImport).not.toHaveBeenCalled();
  });

  it("shows a running import's sub-category, counts and time left instead of a second start", () => {
    const progress = {
      planned: true, pass: "QUOTA" as const, current: 2,
      subcategories: [{ code: "cat-dry-foods", title: "غذای خشک گربه", total: 9000 }, { code: "litter-cat", title: "خاک گربه", total: 5000 }, { code: "dog-collar", title: "قلاده سگ", total: 5800 }],
      plan: [
        { code: "cat-dry-foods", title: "غذای خشک گربه", quota: 7000, taken: 7000, exhausted: false },
        { code: "dog-collar", title: "قلاده سگ", quota: 4800, taken: 0, exhausted: false },
        { code: "litter-cat", title: "خاک گربه", quota: 4200, taken: 0, exhausted: false },
      ],
    };
    renderWithIntl(<DigikalaFactsImportPanel categories={categories} jobs={[{ mode: "DIGIKALA_FACTS", status: "RUNNING", maxProducts: 16000, productsSeen: 4000, productsImported: 3900, productsFailed: 100, progress }]} onStarted={vi.fn()} />, "fa");
    expect(screen.getByText("زیردستهٔ ۳ از ۳: خاک گربه")).toBeTruthy();
    expect(screen.getByText("۴٬۰۰۰ از ۱۶٬۰۰۰ خوانده شده · ۳٬۹۰۰ پیش‌نویس · ۱۰۰ خطا")).toBeTruthy();
    expect(screen.getByText("حدود ۱۱ ساعت مانده")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says it is measuring sub-categories before the plan is ready", () => {
    const progress = { planned: false, pass: "QUOTA" as const, current: 0, plan: [], subcategories: [{ code: "a", title: "A", total: 10 }, { code: "b", title: "B", total: null }] };
    renderWithIntl(<DigikalaFactsImportPanel categories={categories} jobs={[{ mode: "DIGIKALA_FACTS", status: "RUNNING", maxProducts: 16000, productsSeen: 0, progress }]} onStarted={vi.fn()} />, "en");
    expect(screen.getByText("Measuring sub-categories: 1 of 2")).toBeTruthy();
  });

  it("still offers a run after an earlier, smaller one finished (the server only lets it complete the total)", () => {
    renderWithIntl(<DigikalaFactsImportPanel categories={categories} jobs={[{ mode: "DIGIKALA_FACTS", status: "COMPLETED" }]} onStarted={vi.fn()} />, "en");
    expect(screen.getByRole("button", { name: "Start the one-time import" })).toBeTruthy();
  });
});
