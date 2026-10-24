import { afterEach, describe, expect, it, vi } from "vitest";
import { randomId } from "./random-id";

describe("randomId", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("produces a v4 UUID even where crypto.randomUUID is unavailable (plain http)", () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: real.getRandomValues.bind(real) });
    const id = randomId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(randomId()).not.toBe(id);
  });
});
