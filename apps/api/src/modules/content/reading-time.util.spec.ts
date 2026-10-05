import { estimateReadingMinutes } from "./reading-time.util";

describe("estimateReadingMinutes", () => {
  const doc = (n: number, word = "کلمه") => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: Array(n).fill(word).join(" ") }] }] });
  it("is at least one minute, even for an empty body", () => {
    expect(estimateReadingMinutes({ type: "doc", content: [] })).toBe(1);
    expect(estimateReadingMinutes(null)).toBe(1);
  });
  it("rounds up at 200 words per minute, for Persian and English alike", () => {
    expect(estimateReadingMinutes(doc(200))).toBe(1);
    expect(estimateReadingMinutes(doc(201))).toBe(2);
    expect(estimateReadingMinutes(doc(999, "word"))).toBe(5);
  });
  it("reads nested lists and callouts, ignores punctuation-only tokens, and counts extra text", () => {
    const nested = { type: "doc", content: [{ type: "list", items: [[{ type: "text", text: "a b c" }]] }, { type: "callout", content: [{ type: "text", text: "— — d" }] }] };
    expect(estimateReadingMinutes(nested, Array(196).fill("x"))).toBe(1);
    expect(estimateReadingMinutes(nested, Array(197).fill("x"))).toBe(2);
  });
});
