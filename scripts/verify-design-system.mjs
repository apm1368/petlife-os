import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const uiRoot = path.join(root, "packages/ui");
const tokenFile = path.join(root, "packages/design-tokens/css/tokens.css");
const typographyFile = path.join(root, "packages/design-tokens/css/typography.css");
const sourceExtensions = new Set([".ts", ".tsx", ".css"]);

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const item = path.join(directory, entry.name);
    return entry.isDirectory() ? files(item) : sourceExtensions.has(path.extname(entry.name)) ? [item] : [];
  }))).flat();
}

const failures = [];
for (const file of await files(path.join(uiRoot, "src"))) {
  const relative = path.relative(root, file);
  const content = await readFile(file, "utf8");
  const checks = [
    [/(?:^|[^-])#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(/, "hardcoded color"],
    [/font-size\s*:\s*[^;}]*(?:px|rem|em)\b/, "raw font size"],
    [/(?:^|[\s"'])(?:p|m|gap|space|w|h|min-h|max-h|inset)-\[[^\]]*(?:px|rem)\]/, "raw spacing utility"],
    [/(?:^|[;{]\s*)(?:left|right|margin-left|margin-right|padding-left|padding-right|border-left|border-right)\s*:/m, "physical directional CSS"],
  ];
  for (const [pattern, label] of checks) if (pattern.test(content)) failures.push(`${relative}: ${label}`);
}

const tokenCss = await readFile(tokenFile, "utf8");
const typographyCss = await readFile(typographyFile, "utf8");
for (const required of ["--color-brand", "--color-success", "--color-warning", "--color-error", "--color-info", "--color-pending", "--touch-target-min", "--radius-card"]) {
  if (!tokenCss.includes(required)) failures.push(`packages/design-tokens/css/tokens.css: missing ${required}`);
}
for (const required of ["--font-size-12", "--font-size-14", "--font-size-16", "--font-size-20", "--font-size-24", "--font-size-32", "--line-height-fa"]) {
  if (!typographyCss.includes(required)) failures.push(`packages/design-tokens/css/typography.css: missing ${required}`);
}

function parseHex(value) {
  const hex = value.replace("#", "");
  return [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
}
function luminance([red, green, blue]) {
  const channel = (value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}
function contrast(a, b) {
  const [light, dark] = [luminance(parseHex(a)), luminance(parseHex(b))].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
function section(name) {
  const start = tokenCss.indexOf(name);
  const next = tokenCss.indexOf("}", start);
  return tokenCss.slice(start, next);
}
function color(block, token) {
  return block.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
}
for (const [theme, block] of [["light", section(":root {")], ["dark", section(':root[data-theme="dark"]')]]) {
  for (const [foreground, background] of [["--text-primary", "--surface-page"], ["--on-brand", "--brand-solid"], ["--text-secondary", "--surface-raised"]]) {
    const fg = color(block, foreground);
    const bg = color(block, background);
    if (!fg || !bg) failures.push(`${theme}: cannot evaluate ${foreground} on ${background}`);
    else if (contrast(fg, bg) < 4.5) failures.push(`${theme}: ${foreground} on ${background} is below AA`);
  }
}

if (failures.length) {
  console.error("Design-system guard failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Design-system guard passed: semantic tokens, AA contrast, no raw UI values, logical direction only.");
