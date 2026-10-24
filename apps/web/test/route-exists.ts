import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const APP = join(__dirname, "..", "app", "[locale]");

/**
 * True when a localized href ("/fa/pets/abc/health?x=1") is served by a real page in app/[locale]:
 * each segment matches a literal folder or a [param] folder, route groups "(…)" are transparent.
 * Used by "no dead CTA" tests so a link can never point at a route that does not exist.
 */
export function routeExists(href: string): boolean {
  const path = href.split(/[?#]/)[0]!.replace(/^\/(fa|en)(?=\/|$)/, "");
  const segments = path.split("/").filter(Boolean);
  return match(APP, segments);
}

function match(dir: string, segments: string[]): boolean {
  const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
  // Route groups don't consume a URL segment.
  for (const group of entries.filter((e) => e.name.startsWith("("))) if (match(join(dir, group.name), segments)) return true;
  if (segments.length === 0) return existsSync(join(dir, "page.tsx"));
  const [head, ...rest] = segments;
  const literal = entries.find((e) => e.name === head);
  if (literal && match(join(dir, literal.name), rest)) return true;
  return entries.filter((e) => /^\[[^.]+\]$/.test(e.name)).some((p) => match(join(dir, p.name), rest));
}
