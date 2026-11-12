import Link from "next/link";
import type { RichTextBlock, RichTextDocument, RichTextInline } from "@petlife/types";
import { headingAnchor } from "@/lib/seo/rich-text-text";

/**
 * The one renderer for structured rich text (spec: "the renderer must
 * sanitize output, preserve accessibility, support RTL and LTR") — used
 * identically by the admin preview and the public article page, so
 * "preview shows the actual consumer renderer" is true by construction,
 * not by convention. Every block/mark type is a closed, known case; there
 * is no `dangerouslySetInnerHTML` anywhere in this file, so there is no
 * HTML-injection surface to sanitize against in the first place.
 */
export function RichTextRenderer({ body }: { body: RichTextDocument }) {
  let h2Index = -1;
  return (
    <div className="flex flex-col gap-4 text-body leading-relaxed text-text-primary">
      {body.map((block, i) => {
        const anchor = block.type === "heading" && block.level === 2 ? headingAnchor(++h2Index) : undefined;
        // An opening callout is the article's answer-first summary: styled apart and marked speakable.
        return <RichTextBlockView key={i} block={block} anchor={anchor} isSummary={i === 0 && block.type === "callout" && block.tone === "info"} />;
      })}
    </div>
  );
}

function RichTextBlockView({ block, anchor, isSummary }: { block: RichTextBlock; anchor?: string; isSummary?: boolean }) {
  switch (block.type) {
    case "paragraph":
      return (
        <p>
          <Inline content={block.content} />
        </p>
      );
    case "heading": {
      const Tag = (`h${block.level}` as unknown) as "h2" | "h3" | "h4";
      return (
        <Tag id={anchor} className="text-section-title text-text-primary scroll-mt-24">
          <Inline content={block.content} />
        </Tag>
      );
    }
    case "list": {
      const ListTag = block.style === "numbered" ? "ol" : "ul";
      return (
        <ListTag className={block.style === "numbered" ? "list-decimal ps-6" : "list-disc ps-6"}>
          {block.items.map((item, i) => (
            <li key={i}>
              <Inline content={item} />
            </li>
          ))}
        </ListTag>
      );
    }
    case "quote":
      return (
        <blockquote className="border-s-4 border-border-strong ps-4 text-text-secondary italic">
          <Inline content={block.content} />
        </blockquote>
      );
    case "callout":
      return (
        <div role="note" className={(isSummary ? "editorial-summary " : "") + "rounded-md border ps-4 pe-4 py-3 " + (block.tone === "warning" ? "border-state-urgent/40 bg-state-urgent/10" : "border-border-strong bg-surface-elevated")}>
          <Inline content={block.content} />
        </div>
      );
    case "image":
      return (
        <figure className="flex flex-col gap-1.5">
          {/* Rich-text image URLs are authored CMS content and may be signed/private; do not route them through a static image-host allow-list. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {block.url ? <img src={block.url} alt={block.alt} loading="lazy" decoding="async" className="w-full rounded-md" /> : null}
          {block.caption ? <figcaption className="text-metadata text-text-secondary">{block.caption}</figcaption> : null}
        </figure>
      );
    case "video":
      return block.url ? (
        <figure className="editorial-video flex flex-col gap-1.5">
          <video controls muted loop playsInline preload="metadata" poster={block.posterUrl} className="w-full rounded-md" aria-label={block.title}>
            <source src={block.url} type={block.mimeType ?? "video/mp4"} />
          </video>
          <figcaption className="text-metadata text-text-secondary">{block.caption ?? block.title}</figcaption>
        </figure>
      ) : null;
    case "faq":
      return (
        <section className="editorial-faq flex flex-col gap-3">
          {block.items.map((item, i) => (
            <div key={i} className="editorial-faq__item rounded-md border border-border-subtle bg-surface-elevated px-4 py-3">
              <h3 className="font-bold text-text-primary">{item.question}</h3>
              <p className="text-text-secondary">
                <Inline content={item.answer} />
              </p>
            </div>
          ))}
        </section>
      );
    default:
      return null;
  }
}

function Inline({ content }: { content: RichTextInline[] }) {
  return (
    <>
      {content.map((node, i) => {
        if ("type" in node && node.type === "link") {
          const isInternal = node.href.startsWith("/");
          return isInternal ? (
            <Link key={i} href={node.href} className="text-brand-natural underline">
              {node.text}
            </Link>
          ) : (
            <a key={i} href={node.href} target="_blank" rel="noopener noreferrer" className="text-brand-natural underline">
              {node.text}
            </a>
          );
        }
        const marks = "marks" in node ? node.marks ?? [] : [];
        let span = <>{node.text}</>;
        if (marks.includes("code")) span = <code className="rounded bg-surface-elevated px-1 py-0.5 text-metadata">{span}</code>;
        if (marks.includes("italic")) span = <em>{span}</em>;
        if (marks.includes("bold")) span = <strong>{span}</strong>;
        return <span key={i}>{span}</span>;
      })}
    </>
  );
}
