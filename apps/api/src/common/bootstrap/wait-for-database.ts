import { PrismaClient } from "@prisma/client";

export interface WaitOptions {
  /** Give up after this long (ms). */
  timeoutMs: number;
  /** First retry delay (ms); doubles each attempt up to `maxDelayMs`. */
  initialDelayMs?: number;
  maxDelayMs?: number;
  log?: (line: string) => void;
  /** Injected in tests. */
  probe?: () => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * Bounded wait for PostgreSQL before the app boots. After a server reboot the database container can come up
 * seconds after the API; instead of booting half-way (workers ticking, no HTTP listener) the API waits here, and if
 * the database is still unreachable when the window closes it throws so the process exits and PM2 restarts it.
 */
export async function waitForDatabase(url: string | undefined, opts: WaitOptions): Promise<number> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  let client: PrismaClient | null = null;
  const probe =
    opts.probe ??
    (async () => {
      client ??= new PrismaClient({ datasourceUrl: url });
      await client.$queryRaw`SELECT 1`;
    });
  const deadline = now() + opts.timeoutMs;
  let delay = opts.initialDelayMs ?? 1000;
  let attempt = 0;
  try {
    for (;;) {
      attempt++;
      try {
        await probe();
        if (attempt > 1) log(`[boot] database reachable after ${attempt} attempts`);
        return attempt;
      } catch (error) {
        const remaining = deadline - now();
        const lines = (error instanceof Error ? error.message : String(error)).split("\n").map((l) => l.trim()).filter(Boolean);
        const reason = lines.find((l) => /reach|refused|starting up|timed out|authentication|does not exist/i.test(l)) ?? lines[lines.length - 1] ?? "unknown error";
        if (remaining <= 0) throw new Error(`[boot] database unreachable after ${attempt} attempts in ${opts.timeoutMs} ms: ${reason}`);
        const wait = Math.min(delay, remaining);
        log(`[boot] database not ready (attempt ${attempt}): ${reason.slice(0, 160)} — retrying in ${wait} ms`);
        await sleep(wait);
        delay = Math.min(delay * 2, opts.maxDelayMs ?? 10_000);
      }
    }
  } finally {
    await (client as PrismaClient | null)?.$disconnect().catch(() => undefined);
  }
}
