import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { encodeQr, formatBits, qrPath, rsDivisor, rsRemainder } from "./qr-code";

const bitsOf = (modules: boolean[][]) => modules.map((row) => row.map((b) => (b ? 1 : 0)).join("")).join("\n");
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

describe("QR encoder", () => {
  it("matches codes that an independent decoder (zbar) read back exactly", () => {
    // Verified 2026-11-12: zbarimg decoded these two (and nine more, v1–v10, five masks, UTF-8) to the input text.
    const card = encodeQr("https://opetlife.ir/pet-card/Ab3dE5gH7jK9mN1pQr2sT4uV6wX8yZ0_");
    expect([card.version, card.mask]).toEqual([4, 6]);
    expect(sha(bitsOf(card.modules))).toBe("e109c59365949f8dade98d6063d5097b1bebbdcd2d40a8366b97b4fd4f7fcb95");
    const big = encodeQr(`https://opetlife.ir/${"q".repeat(190)}`);
    expect([big.version, big.mask]).toEqual([10, 1]);
    expect(sha(bitsOf(big.modules))).toBe("c62b25b2932f53ae8ab28240c75db242f9cb91c2dfc4a92287e5599bb5e2a4be");
  });

  it("picks the smallest version for the text and refuses what does not fit", () => {
    expect(encodeQr("opetlife").version).toBe(1);
    expect(encodeQr("x".repeat(26)).version).toBe(2);
    expect(encodeQr("x".repeat(27)).version).toBe(3);
    expect(encodeQr("x".repeat(213)).version).toBe(10);
    expect(() => encodeQr("x".repeat(214))).toThrow(RangeError);
  });

  it("draws the three finder patterns and the timing lines", () => {
    const { modules, size } = encodeQr("https://opetlife.ir/pet-card/token");
    const finder = (x0: number, y0: number) =>
      Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, (_, x) => (modules[y0 + y]![x0 + x] ? 1 : 0)).join("")).join("/");
    const expected = "1111111/1000001/1011101/1011101/1011101/1000001/1111111";
    expect(finder(0, 0)).toBe(expected);
    expect(finder(size - 7, 0)).toBe(expected);
    expect(finder(0, size - 7)).toBe(expected);
    for (let i = 8; i < size - 8; i++) {
      expect(modules[6]![i]).toBe(i % 2 === 0);
      expect(modules[i]![6]).toBe(i % 2 === 0);
    }
    expect(modules[size - 8]![8]).toBe(true); // the always-dark module
  });

  it("protects the format bits with the BCH(15,5) code and the standard XOR mask", () => {
    // Level M with mask 0 is the published 101010000010010.
    expect(formatBits(0).toString(2).padStart(15, "0")).toBe("101010000010010");
    for (let mask = 0; mask < 8; mask++) expect(formatBits(mask) >>> 15).toBe(0);
  });

  it("computes the published Reed–Solomon check bytes (version 1-M)", () => {
    const gen = rsDivisor(10);
    // ISO/IEC 18004 example "01234567" and the well-known "HELLO WORLD" walkthrough, both 1-M.
    const iso = [16, 32, 12, 86, 97, 128, 236, 17, 236, 17, 236, 17, 236, 17, 236, 17];
    expect(rsRemainder(iso, gen)).toEqual([165, 36, 212, 193, 237, 54, 199, 135, 44, 85]);
    const hello = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    const ecc = rsRemainder(hello, gen);
    expect(ecc).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
    expect(rsRemainder([...hello, ...ecc], gen).every((b) => b === 0)).toBe(true);
  });

  it("renders as one SVG path with a quiet zone", () => {
    const path = qrPath(encodeQr("opetlife"));
    expect(path.startsWith("M4 4h7v1h-7z")).toBe(true);
  });
});
