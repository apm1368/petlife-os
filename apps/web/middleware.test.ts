// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// next-intl's own locale negotiation is exercised by the running app; here it is a pass-through.
vi.mock("next-intl/middleware", () => ({ default: () => () => NextResponse.next() }));
const { default: middleware } = await import("./middleware");

const run = (path: string) => middleware(new NextRequest(new URL(path, "https://opetlife.ir")));

describe("URL normalisation middleware", () => {
  it("serves the Persian landing at the bare domain", () => {
    const res = run("/");
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://opetlife.ir/fa");
  });

  it("permanently redirects /fa to the bare domain, keeping the query", () => {
    const res = run("/fa?utm=1");
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://opetlife.ir/?utm=1");
  });

  it("permanently lowercases a locale prefix", () => {
    expect(run("/FA/blog/puppy-biting").headers.get("location")).toBe("https://opetlife.ir/fa/blog/puppy-biting");
    expect(run("/De").headers.get("location")).toBe("https://opetlife.ir/de");
    expect(run("/Fa").headers.get("location")).toBe("https://opetlife.ir/");
  });

  it("leaves localized pages alone", () => {
    const res = run("/en/blog");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("states the served language, including on the bare-domain Persian landing", () => {
    expect(run("/de/blog/katze-kratzt-moebel").headers.get("content-language")).toBe("de");
    expect(run("/").headers.get("content-language")).toBe("fa");
    expect(run("/fa").headers.get("content-language")).toBeNull();
  });
});
