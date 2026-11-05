#!/usr/bin/env node
/**
 * Guards the decision-code parity between the authoritative Persian Decision Log and its
 * English companion translation.
 *
 *   node scripts/verify-decision-code-parity.mjs
 *
 * The Persian `docs/decisions.md` is the binding product specification (WB-12, WB-19). The
 * English `docs/decisions.en.md` is a convenience translation and must never drift: a decision
 * code that exists in one file but not the other means a reader of one file is missing a
 * requirement, and a code that exists in neither means a requirement was dropped.
 *
 * Exits non-zero (and prints the missing codes) when the two files disagree.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PERSIAN = join(root, "docs", "decisions.md");
const ENGLISH = join(root, "docs", "decisions.en.md");

/**
 * Decision codes appear as the first cell of a table row: `| F-07 | ... |`.
 * The prefix is 1–3 uppercase letters, optionally one extra segment for
 * hyphenated families such as `AD-P-01`.
 */
const CODE_ROW = /^\|\s+([A-Z]{1,3}(?:-[A-Z])?-\d{2})\s+\|/gm;

function codesIn(file) {
  const text = readFileSync(file, "utf8");
  const found = new Set();
  for (const match of text.matchAll(CODE_ROW)) found.add(match[1]);
  return found;
}

const persian = codesIn(PERSIAN);
const english = codesIn(ENGLISH);

const missingInEnglish = [...persian].filter((c) => !english.has(c)).sort();
const missingInPersian = [...english].filter((c) => !persian.has(c)).sort();

if (missingInEnglish.length || missingInPersian.length) {
  console.error("Decision-code parity check FAILED.");
  if (missingInEnglish.length) {
    console.error(`  Missing from docs/decisions.en.md (${missingInEnglish.length}):`);
    console.error(`    ${missingInEnglish.join(", ")}`);
  }
  if (missingInPersian.length) {
    console.error(`  Missing from docs/decisions.md (${missingInPersian.length}):`);
    console.error(`    ${missingInPersian.join(", ")}`);
  }
  process.exit(1);
}

console.log(
  `Decision-code parity check passed: ${persian.size} codes are present in both ` +
    `docs/decisions.md and docs/decisions.en.md.`,
);
