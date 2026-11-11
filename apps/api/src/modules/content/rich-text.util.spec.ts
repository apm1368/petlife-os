import { validateRichTextDocument } from "./rich-text.util";

describe("rich text validation: video and FAQ blocks", () => {
  it("accepts a titled video block and drops read-only/unknown fields", () => {
    const [block] = validateRichTextDocument([
      { type: "video", mediaAssetId: "11111111-1111-4111-8111-111111111111", title: "How to", description: "Steps", posterMediaAssetId: "22222222-2222-4222-8222-222222222222", durationSeconds: 26.6, url: "https://evil.example/x.mp4", posterUrl: "x", mimeType: "x" },
    ]);
    expect(block).toEqual({ type: "video", mediaAssetId: "11111111-1111-4111-8111-111111111111", title: "How to", description: "Steps", posterMediaAssetId: "22222222-2222-4222-8222-222222222222", durationSeconds: 27 });
  });

  it("rejects a video without a title or with a nonsense duration", () => {
    expect(() => validateRichTextDocument([{ type: "video", mediaAssetId: "m", title: " " }])).toThrow();
    expect(() => validateRichTextDocument([{ type: "video", mediaAssetId: "m", title: "t", durationSeconds: -1 }])).toThrow();
    expect(() => validateRichTextDocument([{ type: "video", mediaAssetId: "", title: "t" }])).toThrow();
  });

  it("accepts FAQ items whose answers are safe inline content", () => {
    const [block] = validateRichTextDocument([{ type: "faq", items: [{ question: "Q?", answer: [{ text: "A, see " }, { type: "link", href: "/fa/blog/puppy-biting", text: "this" }] }] }]);
    expect(block).toEqual({ type: "faq", items: [{ question: "Q?", answer: [{ text: "A, see " }, { type: "link", href: "/fa/blog/puppy-biting", text: "this" }] }] });
  });

  it("rejects empty FAQs, blank questions and unsafe answer links", () => {
    expect(() => validateRichTextDocument([{ type: "faq", items: [] }])).toThrow();
    expect(() => validateRichTextDocument([{ type: "faq", items: [{ question: "", answer: [{ text: "a" }] }] }])).toThrow();
    expect(() => validateRichTextDocument([{ type: "faq", items: [{ question: "q", answer: [{ type: "link", href: "javascript:alert(1)", text: "x" }] }] }])).toThrow();
  });
});
