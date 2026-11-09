import { canonicalDigikalaInput, parseDigikalaCatalogPage } from "./digikala-catalog.parser";
import { robotsDisallowsPath } from "./digikala-robots";

describe("Digikala catalog parser", () => {
  it("extracts only catalog identity and omits source prices and offers", () => {
    const page = parseDigikalaCatalogPage(`<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org", "@type": "Product", sku: "dkp-123456", name: "غذای حیوانات", alternateName: "Pet food",
      brand: { "@type": "Brand", name: "Example" }, category: ["Pets", "Food"], description: "Full description",
      additionalProperty: [{ "@type": "PropertyValue", name: "وزن", value: "۲ کیلوگرم" }], image: ["https://dkstatics-public.digikala.com/images/one.jpg", "https://dkstatics-public.digikala.com/images/two.jpg"],
      offers: { price: "999", availability: "InStock" },
    })}</script>`, "https://www.digikala.com/product/dkp-123456/");
    expect(page.products[0]).toMatchObject({ sourceItemId: "123456", title: "غذای حیوانات", titleEn: "Pet food", brandName: "Example", sourceCategoryName: "Food" });
    expect(page.products[0]).not.toHaveProperty("offers");
    expect(page.products[0]?.images).toHaveLength(2);
  });

  it("finds product links and only follows clean, same-domain pagination paths", () => {
    const page = parseDigikalaCatalogPage(`<a href="/product/dkp-123/">item</a><link rel="next" href="/search/category-pet/page/2/">`, "https://www.digikala.com/search/category-pet/");
    expect(page.productLinks).toEqual(["https://www.digikala.com/product/dkp-123/"]);
    expect(page.nextPageUrl).toBe("https://www.digikala.com/search/category-pet/page/2/");
  });

  it("rejects query URLs and blocks paths prohibited by source robots.txt", () => {
    expect(() => canonicalDigikalaInput("https://www.digikala.com/product/dkp-2/?page=1")).toThrow(/query strings/);
    expect(() => canonicalDigikalaInput("https://www.digikala.com/search/category-pet/?page=2")).toThrow(/query strings/);
    const robots = "User-agent: *\nDisallow: *?*\nDisallow: /product/dkpi-*\nAllow: /product/dkp-*";
    expect(robotsDisallowsPath(robots, "/product/dkp-42/")).toBe(false);
    expect(robotsDisallowsPath(robots, "/product/dkpi-42/")).toBe(true);
    expect(robotsDisallowsPath(robots, "/search/category-pet/?page=2")).toBe(true);
  });
});
