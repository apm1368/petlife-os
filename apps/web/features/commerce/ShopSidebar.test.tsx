import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ShopSidebar } from "./ShopSidebar";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("ShopSidebar", () => {
  it("carries selected discovery filters to the existing results URL", () => {
    renderWithIntl(<ShopSidebar categories={[{ id: "food", name: "Food", slug: "food", parentId: null, status: "ACTIVE" as never }]} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  sensitive food  " } });
    fireEvent.change(screen.getByLabelText("Categories"), { target: { value: "food" } });
    fireEvent.change(screen.getByLabelText("For"), { target: { value: "DOG" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Show products" }));
    const url = new URL(push.mock.calls.at(-1)![0], "https://petlife.test");
    expect(url.pathname).toBe("/en/shop/products");
    expect(Object.fromEntries(url.searchParams)).toEqual({ search: "sensitive food", category: "food", species: "DOG", inStock: "true" });
  });
});
