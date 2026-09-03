import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RichTextDocument } from "@petlife/types";
import { RichTextRenderer } from "./RichTextRenderer";

describe("RichTextRenderer", () => {
  it("renders every closed block type as real semantic elements — never dangerouslySetInnerHTML", () => {
    const body: RichTextDocument = [
      { type: "heading", level: 2, content: [{ text: "Heading" }] },
      { type: "paragraph", content: [{ text: "Plain text with " }, { text: "bold", marks: ["bold"] }] },
      { type: "list", style: "bulleted", items: [[{ text: "Item one" }], [{ text: "Item two" }]] },
      { type: "quote", content: [{ text: "A quotation" }] },
      { type: "callout", tone: "info", content: [{ text: "Heads up" }] },
      { type: "image", mediaAssetId: "media-1", alt: "A dog", url: "https://cdn.example.com/dog.jpg", caption: "Good boy" },
    ];

    render(<RichTextRenderer body={body} />);

    expect(screen.getByRole("heading", { level: 2, name: "Heading" })).toBeTruthy();
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("A quotation").closest("blockquote")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain("Heads up");
    const image = screen.getByAltText("A dog") as HTMLImageElement;
    expect(image.src).toBe("https://cdn.example.com/dog.jpg");
    expect(screen.getByText("Good boy")).toBeTruthy();
  });

  it("renders an internal link as a focusable, keyboard-reachable anchor without target=_blank", () => {
    const body: RichTextDocument = [{ type: "paragraph", content: [{ type: "link", href: "/en/blog/other-post", text: "Read more" }] }];
    render(<RichTextRenderer body={body} />);

    const link = screen.getByRole("link", { name: "Read more" }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/en/blog/other-post");
    expect(link.getAttribute("target")).toBeNull();
    expect(link.tabIndex).not.toBe(-1);
  });

  it("renders an external link with target=_blank and rel=noopener noreferrer", () => {
    const body: RichTextDocument = [{ type: "paragraph", content: [{ type: "link", href: "https://example.com", text: "External" }] }];
    render(<RichTextRenderer body={body} />);

    const link = screen.getByRole("link", { name: "External" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("skips rendering the image element when no url has been resolved, but still shows the caption", () => {
    const body: RichTextDocument = [{ type: "image", mediaAssetId: "media-2", alt: "unresolved" }];
    render(<RichTextRenderer body={body} />);
    expect(screen.queryByAltText("unresolved")).toBeNull();
  });
});
