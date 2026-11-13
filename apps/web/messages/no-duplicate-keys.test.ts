// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { locales } from "@/lib/i18n/config";

/**
 * JSON.parse silently keeps the last of two identical keys, so a duplicated block (e.g. a second "checkout" in
 * de.json) hides every string of the first one. Scan the raw text and report each key that repeats inside the
 * same object, with its path.
 */
export function duplicateKeys(text: string): string[] {
  const stack: { keys: Set<string>; path: string }[] = [];
  const found: string[] = [];
  let pendingKey: string | null = null;
  let i = 0;
  const readString = () => {
    let out = "";
    i++;
    while (text[i] !== '"') {
      if (text[i] === "\\") { out += text[i] + text[i + 1]; i += 2; continue; }
      out += text[i++];
    }
    i++;
    return out;
  };
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      const value = readString();
      let j = i;
      while (/\s/.test(text[j] ?? "")) j++;
      const top = stack.at(-1);
      if (text[j] === ":" && top) {
        if (top.keys.has(value)) found.push(top.path ? `${top.path}.${value}` : value);
        top.keys.add(value);
        pendingKey = value;
      }
      continue;
    }
    if (c === "{") {
      const parent = stack.at(-1);
      stack.push({ keys: new Set(), path: parent && pendingKey !== null ? (parent.path ? `${parent.path}.${pendingKey}` : pendingKey) : "" });
      pendingKey = null;
    } else if (c === "}") {
      stack.pop();
    } else if (c === "[") {
      pendingKey = null;
    }
    i++;
  }
  return found;
}

describe("message catalogs", () => {
  it("finds a duplicated key with its path", () => {
    expect(duplicateKeys('{"a":{"b":"1","b":"2"},"c":{"d":"x"},"c":{"e":"y"}}')).toEqual(["a.b", "c"]);
    expect(duplicateKeys('{"a":"say \\"b\\": hi","b":"ok"}')).toEqual([]);
  });

  it.each([...locales])("%s.json has no duplicate keys at any depth", (locale) => {
    const text = readFileSync(join(__dirname, `${locale}.json`), "utf8");
    expect(duplicateKeys(text)).toEqual([]);
  });
});
