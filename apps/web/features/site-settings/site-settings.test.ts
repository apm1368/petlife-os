import { describe, expect, it } from "vitest";
import { featureForHref, isHrefEnabled, localizedSetting } from "./site-settings";

describe("site settings helpers", () => {
  it("maps paths to their product area", () => {
    expect(featureForHref("/shop/products/1")).toBe("shop");
    expect(featureForHref("/checkout")).toBe("shop");
    expect(featureForHref("/vet/find?near=1")).toBe("services");
    expect(featureForHref("/animal-support/needs")).toBe("animalSupport");
    expect(featureForHref("/home")).toBeNull();
    expect(featureForHref("/shopping")).toBeNull();
  });

  it("hides only areas switched off explicitly", () => {
    expect(isHrefEnabled(null, "/shop")).toBe(true);
    expect(isHrefEnabled({ "platform.announcement": null, "features.shop": false }, "/shop")).toBe(false);
    expect(isHrefEnabled({ "platform.announcement": null, "features.shop": false }, "/travel")).toBe(true);
    expect(isHrefEnabled({ "platform.announcement": null }, "/travel")).toBe(true);
  });

  it("falls back from the viewer's locale to English, then Persian", () => {
    expect(localizedSetting({ fa: "سلام", en: "Hi" }, "de")).toBe("Hi");
    expect(localizedSetting({ fa: "سلام" }, "es")).toBe("سلام");
    expect(localizedSetting({ de: "Hallo", en: "Hi" }, "de")).toBe("Hallo");
    expect(localizedSetting(null, "fa")).toBeNull();
  });
});
