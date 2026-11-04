import { readFile } from "node:fs/promises";
import path from "node:path";

const story = await readFile(path.resolve(import.meta.dirname, "../src/DesignSystem.stories.tsx"), "utf8");
const required = ["FaLight", "FaDark", "EnLight", "EnDark", "ArLight", "ArDark"];
const missing = required.filter((name) => !story.includes(`export const ${name}`));
if (missing.length) throw new Error(`Visual story matrix incomplete: ${missing.join(", ")}`);
console.log("Visual-regression story matrix is present (fa/en/ar × light/dark).");
