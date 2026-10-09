import { waitForDatabase } from "./wait-for-database";

describe("waitForDatabase", () => {
  function clock() {
    let t = 0;
    return { now: () => t, sleep: async (ms: number) => void (t += ms) };
  }

  it("returns once the database answers, retrying with backoff in between", async () => {
    const c = clock();
    let calls = 0;
    const waits: number[] = [];
    const attempts = await waitForDatabase("x", {
      timeoutMs: 60_000,
      probe: async () => {
        if (++calls < 4) throw new Error("Can't reach database server");
      },
      sleep: async (ms) => { waits.push(ms); await c.sleep(ms); },
      now: c.now,
      log: () => undefined,
    });
    expect(attempts).toBe(4);
    expect(waits).toEqual([1000, 2000, 4000]);
  });

  it("gives up with an error when the window closes (the caller exits non-zero)", async () => {
    const c = clock();
    await expect(
      waitForDatabase("x", { timeoutMs: 15_000, probe: async () => { throw new Error("Can't reach database server"); }, sleep: c.sleep, now: c.now, log: () => undefined }),
    ).rejects.toThrow(/database unreachable after \d+ attempts/);
    expect(c.now()).toBe(15_000);
  });
});
