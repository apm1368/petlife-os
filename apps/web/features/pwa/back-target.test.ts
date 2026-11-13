import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parentPath } from "./MobileBackButton";

/** Every member and public page (route groups dropped, dynamic segments as `:x`). */
function pages(dir: string, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) {
      if (entry === "page.tsx") found.push(prefix || "/");
      continue;
    }
    if (entry.startsWith("@") || entry.startsWith("_")) continue;
    const segment = /^\(.*\)$/.test(entry) ? "" : entry.startsWith("[") ? "/:x" : `/${entry}`;
    found.push(...pages(full, prefix + segment));
  }
  return found;
}

const appDir = join(__dirname, "../../app/[locale]");
const routes = [...new Set([...pages(join(appDir, "(app)")), ...pages(join(appDir, "(public)"))])];
const exists = (path: string) => routes.some((route) => new RegExp(`^${route.replace(/:x/g, "[^/]+")}$`).test(path));

describe("mobile back button fallback", () => {
  it("found the member and public pages", () => {
    expect(routes.length).toBeGreaterThan(100);
    expect(routes).toContain("/home");
  });

  it.each(routes.filter((route) => route.split("/").filter(Boolean).length > 1))("goes from %s to a page that exists", (route) => {
    const target = parentPath(route.replace(/:x/g, "abc123"));
    expect(target === "/home" || exists(target), `${route} → ${target}`).toBe(true);
  });

  it("walks up past URL levels that are not pages", () => {
    expect(parentPath("/travel/stays/s1")).toBe("/travel");
    expect(parentPath("/checkout/c1/confirmation")).toBe("/checkout");
    expect(parentPath("/vet/find")).toBe("/home");
    expect(parentPath("/pets/p1/health")).toBe("/pets/p1");
    expect(parentPath("/profile/security")).toBe("/profile");
    expect(parentPath("/bookings")).toBe("/home");
  });
});
