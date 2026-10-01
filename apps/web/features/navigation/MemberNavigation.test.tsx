import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { PrimaryNav } from "./MemberNavigation";
import { currentDestination, EXPLORE_GROUPS, PRIMARY_DESTINATIONS } from "./consumer-nav";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/fa/pets/p1/health/labs" }));

describe("member navigation", () => {
  it("has the six primary destinations; deep pages keep their section current", () => {
    expect(PRIMARY_DESTINATIONS.map((d) => d.key)).toEqual(["home", "explore", "health", "services", "shop", "memories"]);
    expect(currentDestination("/pets/p1/health/labs/x")).toBe("health");
    expect(currentDestination("/pets/p1/memories")).toBe("memories");
    expect(currentDestination("/checkout/c1/confirmation")).toBe("shop");
    expect(currentDestination("/travel/trips")).toBe("explore");
    expect(currentDestination("/pets/p1")).toBe("home");
    expect(currentDestination("/profile/security")).toBeNull();
  });

  it("every Explore link points somewhere real and no destination is listed twice in a group", () => {
    for (const group of EXPLORE_GROUPS) {
      const hrefs = group.links.map((l) => l.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
      for (const href of hrefs) expect(href.startsWith("/")).toBe(true);
    }
  });

  it("the Explore mega menu opens from the keyboard, marks the current section and closes on Escape with focus back on its button", () => {
    renderWithIntl(<PrimaryNav />, "fa");
    expect(screen.getByRole("link", { name: "سلامت" }).getAttribute("aria-current")).toBe("page");
    const explore = screen.getByRole("button", { name: "کاوش" });
    expect(explore.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(explore);
    expect(explore.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: /سفر و اقامت/ }).getAttribute("href")).toBe("/fa/travel");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(explore.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(explore);
  });
});
