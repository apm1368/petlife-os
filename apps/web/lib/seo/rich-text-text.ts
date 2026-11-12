import type { RichTextDocument, RichTextInline } from "@petlife/types";
import { SITE_ORIGIN } from "./site";

export function inlineToText(content: RichTextInline[]): string {
  return content.map((node) => node.text).join("").replace(/\s+/g, " ").trim();
}

function inlineToMarkdown(content: RichTextInline[]): string {
  return content
    .map((node) => {
      if ("type" in node && node.type === "link") return `[${node.text}](${node.href.startsWith("/") ? `${SITE_ORIGIN}${node.href}` : node.href})`;
      const marks = "marks" in node ? node.marks ?? [] : [];
      return marks.includes("bold") ? `**${node.text}**` : node.text;
    })
    .join("");
}

/** Markdown rendering of an article body for llms-full.txt and other plain-text consumers. */
export function richTextToMarkdown(body: RichTextDocument): string {
  const out: string[] = [];
  for (const block of body) {
    switch (block.type) {
      case "paragraph":
        out.push(inlineToMarkdown(block.content));
        break;
      case "heading":
        out.push(`${"#".repeat(block.level)} ${inlineToMarkdown(block.content)}`);
        break;
      case "list":
        out.push(block.items.map((item, i) => `${block.style === "numbered" ? `${i + 1}.` : "-"} ${inlineToMarkdown(item)}`).join("\n"));
        break;
      case "quote":
        out.push(`> ${inlineToMarkdown(block.content)}`);
        break;
      case "callout":
        out.push(`> ${block.tone === "warning" ? "⚠️ " : ""}${inlineToMarkdown(block.content)}`);
        break;
      case "image":
        if (block.url) out.push(`![${block.alt}](${block.url})`);
        break;
      case "video":
        if (block.url) out.push(`[${block.title}](${block.url})${block.description ? ` — ${block.description}` : ""}`);
        break;
      case "faq":
        out.push(block.items.map((item) => `**${item.question}**\n${inlineToMarkdown(item.answer)}`).join("\n\n"));
        break;
    }
  }
  return out.join("\n\n");
}

/** Visible word count of a body (Persian zero-width non-joiners do not split words). */
export function richTextWordCount(body: RichTextDocument): number {
  const text = richTextToMarkdown(body).replace(/\[[^\]]*\]\([^)]*\)/g, " ");
  return text.split(/[\s‌]+/u).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

/** Stable in-page anchor for the n-th level-2 heading, shared by the renderer and the table of contents. */
export function headingAnchor(index: number): string {
  return `section-${index + 1}`;
}
