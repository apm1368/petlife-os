"use client";

import { useTranslations } from "next-intl";
import { Button, Input, Select } from "@petlife/ui";
import type { RichTextBlock, RichTextDocument } from "@petlife/types";

type BlockType = RichTextBlock["type"];

function blockText(block: RichTextBlock): string {
  if (block.type === "list") return block.items.map((item) => item.map((n) => n.text).join("")).join("\n");
  if (block.type === "image") return "";
  return block.content.map((n) => n.text).join("");
}

function withText(block: RichTextBlock, text: string): RichTextBlock {
  if (block.type === "list") return { ...block, items: text.split("\n").filter((l) => l.trim().length > 0).map((line) => [{ text: line }]) };
  if (block.type === "image") return block;
  return { ...block, content: [{ text }] };
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
  }
}

/**
 * A deliberately minimal, block-based structured editor (spec: "avoid a
 * massive block-builder system in H15") — no inline bold/italic/link
 * toolbar this phase (see README "Editor format"); each text block is one
 * plain-text run. Reordering is up/down buttons, not drag-and-drop, so the
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
              <Button type="button" size="sm" variant="ghost" onClick={() => move(i, -1)} aria-label={t("moveUp")}>
                ↑
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => move(i, 1)} aria-label={t("moveDown")}>
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
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="sr-only">{t(`blockType.${block.type}`)}</span>
              <textarea
                className="min-h-[70px] rounded-md border border-border-strong bg-surface-elevated px-3 py-2 text-body text-text-primary"
                value={blockText(block)}
                onChange={(e) => update(i, withText(block, e.target.value))}
              />
            </label>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        {(["paragraph", "heading", "list", "quote", "callout", "image"] as BlockType[]).map((type) => (
          <Button key={type} type="button" size="sm" variant="secondary" onClick={() => add(type)}>
            {t("addBlock", { type: t(`blockType.${type}`) })}
          </Button>
        ))}
      </div>
    </div>
  );
}
