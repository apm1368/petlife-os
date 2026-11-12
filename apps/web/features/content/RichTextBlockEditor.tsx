"use client";

import { useTranslations } from "next-intl";
import { Button, Input, Select } from "@petlife/ui";
import type { RichTextBlock, RichTextDocument, RichTextInline } from "@petlife/types";

type BlockType = RichTextBlock["type"];

const INLINE_TOKEN = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Inline content as editable text: **bold** and [link text](/fa/blog/slug) round-trip; other marks are kept as plain text. */
export function inlineToEditable(content: RichTextInline[]): string {
  return content
    .map((node) => {
      if ("type" in node && node.type === "link") return `[${node.text}](${node.href})`;
      const marks = "marks" in node ? node.marks ?? [] : [];
      return marks.includes("bold") ? `**${node.text}**` : node.text;
    })
    .join("");
}

export function editableToInline(text: string): RichTextInline[] {
  const out: RichTextInline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_TOKEN)) {
    if (match.index! > last) out.push({ text: text.slice(last, match.index) });
    if (match[1] !== undefined) out.push({ text: match[1], marks: ["bold"] });
    else out.push({ type: "link", text: match[2]!, href: match[3]! });
    last = match.index! + match[0].length;
  }
  if (last < text.length || out.length === 0) out.push({ text: text.slice(last) });
  return out;
}

function blockText(block: RichTextBlock): string {
  if (block.type === "list") return block.items.map(inlineToEditable).join("\n");
  if (block.type === "image" || block.type === "video" || block.type === "faq") return "";
  return inlineToEditable(block.content);
}

function withText(block: RichTextBlock, text: string): RichTextBlock {
  if (block.type === "list") return { ...block, items: text.split("\n").filter((l) => l.trim().length > 0).map(editableToInline) };
  if (block.type === "image" || block.type === "video" || block.type === "faq") return block;
  return { ...block, content: editableToInline(text) };
}

function emptyBlock(type: BlockType): RichTextBlock {
  switch (type) {
    case "paragraph":
      return { type: "paragraph", content: [{ text: "" }] };
    case "heading":
      return { type: "heading", level: 2, content: [{ text: "" }] };
    case "list":
      return { type: "list", style: "bulleted", items: [[{ text: "" }]] };
    case "quote":
      return { type: "quote", content: [{ text: "" }] };
    case "callout":
      return { type: "callout", tone: "info", content: [{ text: "" }] };
    case "image":
      return { type: "image", mediaAssetId: "", alt: "" };
    case "video":
      return { type: "video", mediaAssetId: "", title: "" };
    case "faq":
      return { type: "faq", items: [{ question: "", answer: [{ text: "" }] }] };
  }
}

const TEXTAREA = "min-h-[70px] rounded-md border border-border-strong bg-surface-elevated px-3 py-2 text-body text-text-primary";

/**
 * A deliberately minimal, block-based structured editor (spec: "avoid a
 * massive block-builder system in H15"). Text blocks are edited as plain
 * text where **bold** and [link text](/path) are kept, so internal links
 * survive an edit. Reordering is up/down buttons, not drag-and-drop, so the
 * whole editor stays keyboard-usable without a new dependency.
 */
export function RichTextBlockEditor({ value, onChange }: { value: RichTextDocument; onChange: (next: RichTextDocument) => void }) {
  const t = useTranslations("admin.content.blockEditor");

  function update(index: number, block: RichTextBlock) {
    onChange(value.map((b, i) => (i === index ? block : b)));
  }
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  }
  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }
  function add(type: BlockType) {
    onChange([...value, emptyBlock(type)]);
  }

  return (
    <div className="flex flex-col gap-3">
      {value.map((block, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-md border border-border-subtle p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-metadata text-text-secondary">{t(`blockType.${block.type}`)}</span>
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t("moveUp")}>
                ↑
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label={t("moveDown")}>
                ↓
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => remove(i)} aria-label={t("remove")}>
                ✕
              </Button>
            </div>
          </div>

          {block.type === "heading" ? (
            <Select
              label={t("headingLevel")}
              value={String(block.level)}
              onChange={(e) => update(i, { ...block, level: Number(e.target.value) as 2 | 3 | 4 })}
              options={[2, 3, 4].map((l) => ({ value: String(l), label: `H${l}` }))}
            />
          ) : null}

          {block.type === "list" ? (
            <Select label={t("listStyle")} value={block.style} onChange={(e) => update(i, { ...block, style: e.target.value as "bulleted" | "numbered" })} options={[{ value: "bulleted", label: t("bulleted") }, { value: "numbered", label: t("numbered") }]} />
          ) : null}

          {block.type === "callout" ? (
            <Select label={t("calloutTone")} value={block.tone} onChange={(e) => update(i, { ...block, tone: e.target.value as "info" | "warning" })} options={[{ value: "info", label: t("info") }, { value: "warning", label: t("warning") }]} />
          ) : null}

          {block.type === "image" ? (
            <div className="flex flex-wrap gap-2">
              <Input label={t("mediaAssetId")} value={block.mediaAssetId} onChange={(e) => update(i, { ...block, mediaAssetId: e.target.value })} className="min-w-[220px]" />
              <Input label={t("altText")} value={block.alt} onChange={(e) => update(i, { ...block, alt: e.target.value })} className="min-w-[220px] flex-1" />
              <Input label={t("caption")} value={block.caption ?? ""} onChange={(e) => update(i, { ...block, caption: e.target.value })} className="min-w-[220px] flex-1" />
            </div>
          ) : block.type === "video" ? (
            <div className="flex flex-wrap gap-2">
              <Input label={t("mediaAssetId")} value={block.mediaAssetId} onChange={(e) => update(i, { ...block, mediaAssetId: e.target.value })} className="min-w-[220px]" />
              <Input label={t("videoTitle")} value={block.title} onChange={(e) => update(i, { ...block, title: e.target.value })} className="min-w-[220px] flex-1" />
              <Input label={t("videoDescription")} value={block.description ?? ""} onChange={(e) => update(i, { ...block, description: e.target.value || undefined })} className="min-w-[220px] flex-1" />
              <Input label={t("posterMediaAssetId")} value={block.posterMediaAssetId ?? ""} onChange={(e) => update(i, { ...block, posterMediaAssetId: e.target.value || undefined })} className="min-w-[220px]" />
              <Input label={t("durationSeconds")} type="number" min={1} value={block.durationSeconds ? String(block.durationSeconds) : ""} onChange={(e) => update(i, { ...block, durationSeconds: e.target.value ? Number(e.target.value) : undefined })} className="w-[140px]" />
              <Input label={t("caption")} value={block.caption ?? ""} onChange={(e) => update(i, { ...block, caption: e.target.value || undefined })} className="min-w-[220px] flex-1" />
            </div>
          ) : block.type === "faq" ? (
            <div className="flex flex-col gap-3">
              {block.items.map((item, j) => (
                <div key={j} className="flex flex-col gap-1.5 rounded-md bg-surface-elevated p-2">
                  <Input label={t("faqQuestion")} value={item.question} onChange={(e) => update(i, { ...block, items: block.items.map((it, k) => (k === j ? { ...it, question: e.target.value } : it)) })} />
                  <label className="flex flex-col gap-1.5">
                    <span className="text-metadata text-text-secondary">{t("faqAnswer")}</span>
                    <textarea className={TEXTAREA} value={inlineToEditable(item.answer)} onChange={(e) => update(i, { ...block, items: block.items.map((it, k) => (k === j ? { ...it, answer: editableToInline(e.target.value) } : it)) })} />
                  </label>
                  <Button type="button" size="sm" variant="ghost" disabled={block.items.length === 1} onClick={() => update(i, { ...block, items: block.items.filter((_, k) => k !== j) })}>
                    {t("removeFaqItem")}
                  </Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="secondary" onClick={() => update(i, { ...block, items: [...block.items, { question: "", answer: [{ text: "" }] }] })}>
                {t("addFaqItem")}
              </Button>
            </div>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="sr-only">{t(`blockType.${block.type}`)}</span>
              <textarea className={TEXTAREA} value={blockText(block)} onChange={(e) => update(i, withText(block, e.target.value))} />
            </label>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        {(["paragraph", "heading", "list", "quote", "callout", "image", "video", "faq"] as BlockType[]).map((type) => (
          <Button key={type} type="button" size="sm" variant="secondary" onClick={() => add(type)}>
            {t("addBlock", { type: t(`blockType.${type}`) })}
          </Button>
        ))}
      </div>
    </div>
  );
}
