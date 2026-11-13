#!/usr/bin/env python3
"""Convert an article .md file (the writers' format) into opetlife's RichTextDocument JSON.

Usage: python3 -I md2rich.py <file.md> [--json]   -> validates; with --json prints the converted article.

Format
------
---
slug: dog-potty-training
title: ...
seoTitle: ...            (<= 60 chars)
seoDescription: ...      (120-160 chars)
excerpt: ...             (<= 300 chars)
focusKeyword: ...
coverAlt: ...
infographicAlt: ...
videoTitle: ...
videoDescription: ...
---
Blocks are separated by blank lines:
  ## Heading 2 / ### Heading 3
  - bulleted item lines (consecutive)      1. numbered item lines (consecutive)
  > quote
  :::summary ... :::   (info callout, "key takeaways"; first block of the article)
  :::tip ... :::       (info callout)       :::warning ... ::: (warning callout)
  :::faq
  ? Question
  Answer text (one paragraph)
  ? Next question
  Answer
  :::
  [[VIDEO]]  [[INFOGRAPHIC]]
  @@scenes            (video/infographic script; 5-6 lines "Heading | one short line")
  Heading | line
  @@
Inline: **bold** and [link text](/fa/blog/slug) or (https://...). Nothing else.
"""
import json
import re
import sys

SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
INLINE = re.compile(r"\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)")
REQUIRED = ["slug", "title", "seoTitle", "seoDescription", "excerpt", "focusKeyword", "coverAlt", "infographicAlt", "videoTitle", "videoDescription"]


class Problem(Exception):
    pass


def inline(text: str):
    out, pos = [], 0
    text = text.strip()
    for m in INLINE.finditer(text):
        if m.start() > pos:
            out.append({"text": text[pos:m.start()]})
        if m.group(1) is not None:
            out.append({"text": m.group(1), "marks": ["bold"]})
        else:
            href = m.group(3)
            if not (href.startswith("/") and not href.startswith("//")) and not re.match(r"^https?://", href):
                raise Problem(f"unsafe link href: {href}")
            out.append({"type": "link", "href": href, "text": m.group(2)})
        pos = m.end()
    if pos < len(text):
        out.append({"text": text[pos:]})
    if "**" in "".join(n.get("text", "") for n in out if "type" not in n):
        raise Problem(f"unbalanced ** in: {text[:60]}")
    if not out:
        raise Problem("empty inline content")
    return out


def parse(src: str):
    if not src.startswith("---"):
        raise Problem("missing front matter")
    _, fm, body = src.split("---", 2)
    meta = {}
    for line in fm.strip().splitlines():
        if not line.strip():
            continue
        key, _, value = line.partition(":")
        meta[key.strip()] = value.strip()
    for key in REQUIRED:
        if not meta.get(key):
            raise Problem(f"front matter missing {key}")
    if not SLUG.match(meta["slug"]):
        raise Problem(f"bad slug {meta['slug']}")
    if len(meta["seoTitle"]) > 60:
        raise Problem(f"seoTitle {len(meta['seoTitle'])} chars > 60")
    if not 110 <= len(meta["seoDescription"]) <= 165:
        raise Problem(f"seoDescription {len(meta['seoDescription'])} chars, want 120-160")
    if len(meta["excerpt"]) > 300:
        raise Problem("excerpt > 300 chars")
    if len(meta["title"]) > 200:
        raise Problem("title > 200 chars")

    lines = body.strip("\n").splitlines()
    blocks, scenes, i = [], [], 0

    def para_lines(start):
        j, acc = start, []
        while j < len(lines) and lines[j].strip():
            acc.append(lines[j].strip())
            j += 1
        return acc, j

    while i < len(lines):
        line = lines[i].rstrip()
        s = line.strip()
        if not s:
            i += 1
            continue
        if s.startswith(":::"):
            kind = s[3:].strip()
            j, acc = i + 1, []
            while j < len(lines) and lines[j].strip() != ":::":
                acc.append(lines[j])
                j += 1
            if j >= len(lines):
                raise Problem(f"unclosed :::{kind}")
            i = j + 1
            if kind in ("summary", "tip", "warning"):
                text = " ".join(a.strip() for a in acc if a.strip())
                blocks.append({"type": "callout", "tone": "warning" if kind == "warning" else "info", "content": inline(text)})
            elif kind == "faq":
                items, q, a = [], None, []
                for raw in acc + ["? __end__"]:
                    r = raw.strip()
                    if not r:
                        continue
                    if r.startswith("? "):
                        if q is not None:
                            if not a:
                                raise Problem(f"faq question without answer: {q}")
                            items.append({"question": q, "answer": inline(" ".join(a))})
                        q, a = r[2:].strip(), []
                    else:
                        if q is None:
                            raise Problem("faq answer before any question")
                        a.append(r)
                if len(items) < 3:
                    raise Problem("faq needs at least 3 questions")
                blocks.append({"type": "faq", "items": items})
            else:
                raise Problem(f"unknown container :::{kind}")
            continue
        if s == "@@scenes":
            j = i + 1
            while j < len(lines) and lines[j].strip() != "@@":
                r = lines[j].strip()
                if r:
                    if "|" not in r:
                        raise Problem(f"scene line needs 'Heading | line': {r}")
                    h, _, t = r.partition("|")
                    scenes.append({"heading": h.strip(), "line": t.strip()})
                j += 1
            if j >= len(lines):
                raise Problem("unclosed @@scenes")
            i = j + 1
            continue
        if s == "[[VIDEO]]":
            blocks.append({"type": "video", "mediaAssetId": "__VIDEO__", "title": meta["videoTitle"], "description": meta["videoDescription"]})
            i += 1
            continue
        if s == "[[INFOGRAPHIC]]":
            blocks.append({"type": "image", "mediaAssetId": "__INFOGRAPHIC__", "alt": meta["infographicAlt"]})
            i += 1
            continue
        if s.startswith("#### "):
            blocks.append({"type": "heading", "level": 4, "content": inline(s[5:])})
            i += 1
            continue
        if s.startswith("### "):
            blocks.append({"type": "heading", "level": 3, "content": inline(s[4:])})
            i += 1
            continue
        if s.startswith("## "):
            blocks.append({"type": "heading", "level": 2, "content": inline(s[3:])})
            i += 1
            continue
        if s.startswith("# "):
            raise Problem("do not use H1 (#) in the body; the title is the H1")
        if re.match(r"^[-*] ", s):
            items = []
            while i < len(lines) and re.match(r"^\s*[-*] ", lines[i]):
                items.append(inline(re.sub(r"^\s*[-*] ", "", lines[i])))
                i += 1
            blocks.append({"type": "list", "style": "bulleted", "items": items})
            continue
        if re.match(r"^\d+[.)] ", s):
            items = []
            while i < len(lines) and re.match(r"^\s*\d+[.)] ", lines[i]):
                items.append(inline(re.sub(r"^\s*\d+[.)] ", "", lines[i])))
                i += 1
            blocks.append({"type": "list", "style": "numbered", "items": items})
            continue
        if s.startswith("> "):
            acc, i = para_lines(i)
            blocks.append({"type": "quote", "content": inline(" ".join(a.lstrip("> ").strip() for a in acc))})
            continue
        acc, i = para_lines(i)
        blocks.append({"type": "paragraph", "content": inline(" ".join(acc))})

    types = [b["type"] for b in blocks]
    if not blocks or not (blocks[0]["type"] == "callout"):
        raise Problem("first block must be the :::summary callout")
    if types.count("video") != 1:
        raise Problem("exactly one [[VIDEO]] required")
    if types.count("image") != 1:
        raise Problem("exactly one [[INFOGRAPHIC]] required")
    if types.count("faq") != 1:
        raise Problem("exactly one :::faq block required")
    if sum(1 for b in blocks if b["type"] == "heading" and b["level"] == 2) < 4:
        raise Problem("need at least 4 H2 sections")
    if not 4 <= len(scenes) <= 6:
        raise Problem(f"need 4-6 scene lines, got {len(scenes)}")
    for sc in scenes:
        if len(sc["heading"]) > 34 or len(sc["line"]) > 90:
            raise Problem(f"scene too long (heading<=34, line<=90): {sc}")

    texts = []

    def collect(node):
        if isinstance(node, dict):
            for k, v in node.items():
                if k in ("text", "question") and isinstance(v, str):
                    texts.append(v)
                elif isinstance(v, (dict, list)):
                    collect(v)
        elif isinstance(node, list):
            for v in node:
                collect(v)

    collect(blocks)
    words = len([w for w in re.split(r"[\s‌]+", " ".join(texts)) if re.search(r"\w", w)])
    links = [n["href"] for b in blocks for part in ([b.get("content", [])] + b.get("items", []) if b["type"] != "faq" else [it["answer"] for it in b["items"]]) for n in part if isinstance(n, dict) and n.get("type") == "link"]
    return {"meta": meta, "body": blocks, "scenes": scenes, "stats": {"blocks": len(blocks), "approxWords": words, "internalLinks": len([l for l in links if l.startswith("/")])}}


def main():
    path = sys.argv[1]
    try:
        article = parse(open(path, encoding="utf-8").read())
    except Problem as p:
        print(f"FAIL {path}: {p}")
        sys.exit(1)
    if "--json" in sys.argv:
        print(json.dumps(article, ensure_ascii=False, indent=1))
    else:
        st = article["stats"]
        print(f"OK {path}: {st['blocks']} blocks, ~{st['approxWords']} words, {st['internalLinks']} internal links, {len(article['scenes'])} scenes")


if __name__ == "__main__":
    main()
