import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { useCategoryName } from "./category-name";

function Names({ categories }: { categories: { slug: string; name: string }[] }) {
  const categoryName = useCategoryName();
  return <ul>{categories.map((c) => <li key={c.slug}>{categoryName(c)}</li>)}</ul>;
}
const shop = [{ slug: "food", name: "Food" }, { slug: "treats", name: "Treats" }, { slug: "grooming", name: "Grooming" }, { slug: "accessories", name: "Accessories" }];

describe("shop category names", () => {
  it.each([
    ["fa", ["غذا", "تشویقی", "آرایش و نظافت", "لوازم جانبی"]],
    ["en", ["Food", "Treats", "Grooming", "Accessories"]],
    ["de", ["Futter", "Leckerlis", "Pflege", "Zubehör"]],
    ["es", ["Comida", "Premios", "Higiene y cuidado", "Accesorios"]],
  ] as const)("shows the seeded categories in %s", (locale, expected) => {
    renderWithIntl(<Names categories={shop} />, locale);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([...expected]);
  });

  it("keeps the stored name for a category that has no translation yet", () => {
    renderWithIntl(<Names categories={[{ slug: "new-staff-category", name: "Aquarium plants" }]} />, "fa");
    expect(screen.getByText("Aquarium plants")).toBeTruthy();
  });
});
