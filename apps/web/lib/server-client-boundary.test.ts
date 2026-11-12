import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";

/**
 * A server module that imports a non-component value (a constant, a helper) from a "use client" module receives a client
 * reference, not the value. That is how ARTICLE_INDEX_PAGE_SIZE reached the API as "function(){throw Error(…)}" and
 * every blog/guides/category index went out as an empty `noindex` page (2026-11-12). Server entry points may import only
 * components (PascalCase) and types from client modules.
 */
const ROOT = process.cwd();
const isClient = (file: string) => /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*["']use client["']/.test(readFileSync(file, "utf8").slice(0, 400));
function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}
function resolve(from: string, spec: string) {
  const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : spec.startsWith(".") ? normalize(join(dirname(from), spec)) : null;
  if (!base) return null;
  for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) if (existsSync(base + ext) && statSync(base + ext).isFile()) return base + ext;
  return null;
}
const serverEntries = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "lib", "seo")), ...walk(join(ROOT, "features")).filter((f) => /-route\.tsx?$/.test(f))].filter((f) => !isClient(f));

describe("server/client module boundary", () => {
  it("server entry points import only components and types from client modules", () => {
    const leaks: string[] = [];
    for (const file of serverEntries) {
      for (const m of readFileSync(file, "utf8").matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g)) {
        if (m[1]) continue;
        const target = resolve(file, m[3]!);
        if (!target || !isClient(target)) continue;
        for (const raw of m[2]!.split(",").map((s) => s.trim()).filter(Boolean)) {
          if (raw.startsWith("type ")) continue;
          const name = raw.split(/\s+as\s+/)[0]!.trim();
          if (!/^[A-Z][a-z]/.test(name)) leaks.push(`${relative(ROOT, file)} imports ${name} from ${relative(ROOT, target)}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });
});
