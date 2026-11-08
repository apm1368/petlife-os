import { excerpt, fromSnapshot, normalizeSearchText, scoreArticle, searchTerms, SLUG_PATTERN, toSnapshot } from "./help-center.util";

describe("help center search normalization", () => {
  it("treats Arabic and Persian letter variants as the same letter", () => {
    expect(normalizeSearchText("كتاب")).toBe(normalizeSearchText("کتاب"));
    expect(normalizeSearchText("علي")).toBe(normalizeSearchText("علی"));
  });

  it("matches Persian, Arabic-Indic and latin digits to each other", () => {
    expect(normalizeSearchText("سفارش ۱۲۳")).toBe(normalizeSearchText("سفارش 123"));
    expect(normalizeSearchText("سفارش ١٢٣")).toBe(normalizeSearchText("سفارش 123"));
  });

  it("splits on whitespace and ZWNJ and drops empty terms", () => {
    expect(searchTerms("  بازپرداخت   سفارش ")).toEqual(["بازپرداخت", "سفارش"]);
    expect(searchTerms("می‌خواهم")).toEqual(["می", "خواهم"]);
    expect(searchTerms("   ")).toEqual([]);
  });

  it("caps the number of terms so a pathological query cannot fan out", () => {
    expect(searchTerms("a b c d e f g h i j k l")).toHaveLength(8);
  });
});

describe("help center article scoring", () => {
  const refund = { title: "بازپرداخت سفارش", summary: "چگونه پول را پس بگیریم", body: "برای لغو سفارش وارد حساب شوید." };

  it("scores a title hit above a summary hit above a body hit", () => {
    const title = scoreArticle({ title: "لغو", summary: null, body: "" }, ["لغو"]);
    const summary = scoreArticle({ title: "x", summary: "لغو", body: "" }, ["لغو"]);
    const body = scoreArticle({ title: "x", summary: null, body: "لغو" }, ["لغو"]);
    expect(title).toBeGreaterThan(summary);
    expect(summary).toBeGreaterThan(body);
    expect(body).toBeGreaterThan(0);
  });

  it("requires every term to match, so a second word narrows rather than widens", () => {
    expect(scoreArticle(refund, ["بازپرداخت"])).toBeGreaterThan(0);
    expect(scoreArticle(refund, ["بازپرداخت", "سفارش"])).toBeGreaterThan(0);
    expect(scoreArticle(refund, ["بازپرداخت", "کشتی"])).toBe(0);
  });

  it("matches across the Arabic/Persian letter variants and digits", () => {
    expect(scoreArticle({ title: "کتاب راهنما", summary: null, body: "" }, searchTerms("كتاب"))).toBeGreaterThan(0);
    expect(scoreArticle({ title: "سفارش 12", summary: null, body: "" }, searchTerms("۱۲"))).toBeGreaterThan(0);
  });

  it("scores zero for an empty term list rather than matching everything", () => {
    expect(scoreArticle(refund, [])).toBe(0);
  });
});

describe("help article snapshots", () => {
  const article = { categoryId: "c", slug: "refunds", title: "T", summary: null, body: "B", contextKeys: ["checkout.payment"], isFaq: true, sortOrder: 3 };

  it("round-trips through a snapshot without sharing the contextKeys array", () => {
    const snap = toSnapshot(article);
    expect(snap).toEqual(article);
    expect(snap.contextKeys).not.toBe(article.contextKeys);
    expect(fromSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(article);
  });

  it("rejects a malformed snapshot instead of guessing", () => {
    expect(fromSnapshot(null)).toBeNull();
    expect(fromSnapshot("text")).toBeNull();
    expect(fromSnapshot({ ...article, title: 5 })).toBeNull();
    expect(fromSnapshot({ ...article, contextKeys: ["ok", 3] })).toBeNull();
    expect(fromSnapshot({ slug: "x" })).toBeNull();
  });
});

describe("slugs and excerpts", () => {
  it("accepts only lowercase latin slugs", () => {
    for (const ok of ["refunds", "order-tracking", "a1-b2"]) expect(SLUG_PATTERN.test(ok)).toBe(true);
    for (const bad of ["Refunds", "-lead", "trail-", "double--hyphen", "فارسی", "has space", ""]) expect(SLUG_PATTERN.test(bad)).toBe(false);
  });

  it("truncates a long body with an ellipsis and leaves a short one alone", () => {
    expect(excerpt("short   text")).toBe("short text");
    const long = excerpt("x".repeat(500));
    expect(long.endsWith("…")).toBe(true);
    expect(long.length).toBeLessThanOrEqual(201);
  });
});
