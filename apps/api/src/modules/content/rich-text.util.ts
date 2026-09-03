import type { RichTextBlock, RichTextDocument, RichTextInline, RichTextMark } from "@petlife/types";
import { InvalidRichTextContentException } from "../../common/errors/api-exception";

const MARKS: RichTextMark[] = ["bold", "italic", "code"];
const HEADING_LEVELS = [2, 3, 4];
const LIST_STYLES = ["bulleted", "numbered"];
const CALLOUT_TONES = ["info", "warning"];

/** http(s):// or a same-origin relative path only — never javascript:/data:/anything else (spec: "prevent arbitrary script injection"). Mirrors the exact allow-list ContentBlockLocale.ctaHref validation uses. */
export function isSafeHref(href: string): boolean {
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function fail(reason: string): never {
  throw new InvalidRichTextContentException({ reason });
}

function isPlainString(value: unknown): value is string {
  return typeof value === "string";
}

function validateInline(node: unknown): RichTextInline {
  if (typeof node !== "object" || node === null) fail("inline node must be an object");
  const record = node as Record<string, unknown>;

  if (record.type === "link") {
    if (!isPlainString(record.href) || !isSafeHref(record.href)) fail("link href must be an http(s) URL or a relative path");
    if (!isPlainString(record.text) || record.text.length === 0) fail("link text must be a non-empty string");
    return { type: "link", href: record.href, text: record.text };
  }

  if (!isPlainString(record.text)) fail("inline text run must have a string 'text' field");
  let marks: RichTextMark[] | undefined;
  if (record.marks !== undefined) {
    if (!Array.isArray(record.marks) || record.marks.some((m) => !MARKS.includes(m as RichTextMark))) fail("inline marks must be a subset of bold/italic/code");
    marks = record.marks as RichTextMark[];
  }
  return marks ? { text: record.text, marks } : { text: record.text };
}

function validateInlineArray(value: unknown): RichTextInline[] {
  if (!Array.isArray(value) || value.length === 0) fail("block content must be a non-empty array of inline nodes");
  return value.map(validateInline);
}

function validateBlock(node: unknown): RichTextBlock {
  if (typeof node !== "object" || node === null) fail("block must be an object");
  const record = node as Record<string, unknown>;

  switch (record.type) {
    case "paragraph":
    case "quote":
      return { type: record.type, content: validateInlineArray(record.content) };
    case "heading": {
      if (!HEADING_LEVELS.includes(record.level as number)) fail("heading level must be 2, 3, or 4");
      return { type: "heading", level: record.level as 2 | 3 | 4, content: validateInlineArray(record.content) };
    }
    case "list": {
      if (!LIST_STYLES.includes(record.style as string)) fail("list style must be bulleted or numbered");
      if (!Array.isArray(record.items) || record.items.length === 0) fail("list must have at least one item");
      return { type: "list", style: record.style as "bulleted" | "numbered", items: record.items.map((item) => validateInlineArray(item)) };
    }
    case "callout": {
      if (!CALLOUT_TONES.includes(record.tone as string)) fail("callout tone must be info or warning");
      return { type: "callout", tone: record.tone as "info" | "warning", content: validateInlineArray(record.content) };
    }
    case "image": {
      if (!isPlainString(record.mediaAssetId) || record.mediaAssetId.length === 0) fail("image block requires a mediaAssetId");
      if (!isPlainString(record.alt)) fail("image block requires alt text — accessibility is not optional");
      const caption = record.caption;
      if (caption !== undefined && !isPlainString(caption)) fail("image caption must be a string when present");
      return caption !== undefined ? { type: "image", mediaAssetId: record.mediaAssetId, alt: record.alt, caption } : { type: "image", mediaAssetId: record.mediaAssetId, alt: record.alt };
    }
    default:
      fail(`unrecognized block type: ${String(record.type)}`);
  }
}

/**
 * The one place a RichTextDocument is ever accepted from an admin request —
 * structurally validates every block/mark/link against the closed
 * vocabulary in @petlife/types (spec: "sanitize rich content"). Rejects
 * outright (never silently strips) so an editor always knows a save failed
 * rather than silently losing content.
 */
export function validateRichTextDocument(value: unknown): RichTextDocument {
  if (!Array.isArray(value)) fail("body must be an array of blocks");
  return value.map(validateBlock);
}
