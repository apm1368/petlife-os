import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "opl-touch.css"), "utf8");
const block = (query: string) => {
  const start = css.indexOf(`@media ${query} {`);
  expect(start, `missing @media ${query}`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("\n}", start));
};

describe("touch screens (owner's P7 design pass, 2026-11-13)", () => {
  it("hides Cookie the cursor dog where there is no cursor, so it never sits on buttons or content", () => {
    expect(block("(hover: none) and (pointer: coarse)")).toMatch(/:root \.opl-ck-host \{ display: none !important; \}/);
  });

  it("gives the header, reel, footer and filter controls 44px targets, scoped under :root to win the cascade", () => {
    const touch = block("(pointer: coarse)");
    for (const selector of [".opl-iconbtn", ".opl-rbtn", ".disc-row__save"]) expect(touch).toContain(`:root ${selector} { width: 44px; height: 44px; }`);
    for (const selector of [".opl-lang", ".opl-btn.sm", ".opl-cookie-toggle", ".opl-seg button", ".section-tabs a", ".opl-foot__back", ".opl-foot ul a"]) expect(touch).toContain(`:root ${selector}`);
    expect(touch.match(/min-height: 44px/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
