import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { localizeHref } from "../features/navigation/localized-link";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") && !p.endsWith(".test.tsx") ? [p] : [];
  });
}

describe("locale-safe internal links", () => {
  it("localizeHref prefixes only locale-less internal paths", () => {
    expect(localizeHref("/pets/1", "en")).toBe("/en/pets/1");
    expect(localizeHref("/fa/pets/1", "en")).toBe("/fa/pets/1");
    expect(localizeHref("/en?x=1", "fa")).toBe("/en?x=1");
    expect(localizeHref("https://example.com/x", "fa")).toBe("https://example.com/x");
    expect(localizeHref("//evil.example/x", "fa")).toBe("//evil.example/x");
    expect(localizeHref("/api/uploads/x", "fa")).toBe("/api/uploads/x");
    expect(localizeHref("#top", "fa")).toBe("#top");
  });

  it("no component links to a locale-less internal path through plain next/link or next/navigation", () => {
    const offenders: string[] = [];
    for (const f of [...files(join(__dirname, "../features")), ...files(join(__dirname, "../app"))]) {
      const s = readFileSync(f, "utf8");
      if (s.includes("@/features/navigation/localized-link")) continue;
      const lines = s.split("\n");
      lines.forEach((line, i) => {
        if (/href=\{`\/[a-z]|href="\/[a-z]|router\.(push|replace)\((`|")\/[a-z]/.test(line) && !line.includes("${locale}") && !/\/api\//.test(line)) offenders.push(`${f}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
