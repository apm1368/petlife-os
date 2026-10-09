import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { routeExists } from "./route-exists";

const ROOT = join(__dirname, "..");
const DIRS = ["app", "features", "lib"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" ? [] : files(full);
    return /\.(tsx?|ts)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/**
 * Route audit: every internal link written in the web code must open a real page in app/[locale].
 * Checked: template links `/${locale}/…` and plain `href:`/`path:` config strings ("/pets/…"). A `${…}` that is a
 * whole segment stands for a dynamic [param]; a link whose shape is only known at runtime (`/${locale}${x}`) is
 * out of scope here (the notification deep-link test covers the API's links).
 */
/** Shell navs write links relative to their portal root; pet-overview items are relative to /pets/:id. */
const BASES: [RegExp, string][] = [
  [/^features\/admin\//, "/admin"],
  [/^features\/provider\//, "/provider"],
  [/^features\/seller\//, "/seller"],
  [/^features\/pets\/overview-labels\.ts$/, "/pets/x"],
];

function collect(): { link: string; where: string }[] {
  const out: { link: string; where: string }[] = [];
  for (const file of DIRS.flatMap((d) => files(join(ROOT, d)))) {
    const src = readFileSync(file, "utf8");
    // Portal-relative links use URL-style prefixes on both Windows and CI/Linux.
    const where = relative(ROOT, file).split(sep).join("/");
    for (const m of src.matchAll(/`\/\$\{locale\}(\/[^`]*)`/g)) out.push({ link: m[1]!, where });
    for (const m of src.matchAll(/\b(?:href|path)\s*:\s*"(\/[a-z][^"]*)"/g)) out.push({ link: m[1]!, where });
  }
  return out;
}

function normalise(link: string): string | null {
  const path = link.split(/[?#]/)[0]!;
  const segments = path.split("/").filter(Boolean);
  const mapped: string[] = [];
  for (const s of segments) {
    if (/^\$\{[^}]+\}$/.test(s)) mapped.push("x");
    else if (s.includes("${")) return null;
    else mapped.push(s);
  }
  return `/${mapped.join("/")}`;
}

describe("internal links", () => {
  const links = collect()
    .map((l) => ({ ...l, path: normalise(l.link) }))
    .filter((l): l is { link: string; where: string; path: string } => l.path !== null && !l.path.startsWith("/api/") && !l.path.startsWith("/_next"));

  it("finds the app's links (sanity)", () => {
    expect(links.length).toBeGreaterThan(100);
  });

  it("every internal link resolves to a real page", () => {
    const resolves = (l: { where: string; path: string }) => routeExists(`/fa${l.path}`) || BASES.some(([re, base]) => re.test(l.where) && routeExists(`/fa${base}${l.path}`));
    // A link with a runtime segment is checked only when its literal shape can be matched at all.
    const dead = links.filter((l) => !resolves(l) && !l.link.split(/[?#]/)[0]!.includes("${")).map((l) => `${l.where}: ${l.link}`);
    expect([...new Set(dead)]).toEqual([]);
  });
});
