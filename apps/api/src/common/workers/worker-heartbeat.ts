/**
 * In-process heartbeat for the interval workers (the API runs as one PM2 fork process, so this map is the whole
 * picture). `trackWorker` wraps a tick: it records start / success / failure and re-throws, so each worker keeps its
 * own error logging. Admin system health reads `workerHeartbeats()`; nothing here is persisted.
 */
export interface WorkerHeartbeat {
  name: string;
  intervalMs: number;
  lastStartedAt: string | null;
  lastSucceededAt: string | null;
  lastFailedAt: string | null;
  lastErrorCategory: string | null;
  running: boolean;
}

const beats = new Map<string, WorkerHeartbeat>();

export function registerWorker(name: string, intervalMs: number): void {
  if (!beats.has(name)) beats.set(name, { name, intervalMs, lastStartedAt: null, lastSucceededAt: null, lastFailedAt: null, lastErrorCategory: null, running: false });
}

export async function trackWorker<T>(name: string, intervalMs: number, tick: () => Promise<T>): Promise<T> {
  registerWorker(name, intervalMs);
  const beat = beats.get(name)!;
  beat.running = true;
  beat.lastStartedAt = new Date().toISOString();
  try {
    const result = await tick();
    beat.lastSucceededAt = new Date().toISOString();
    return result;
  } catch (error) {
    beat.lastFailedAt = new Date().toISOString();
    // A category, never the message: messages can carry identifiers or provider payloads.
    beat.lastErrorCategory = error instanceof Error ? error.constructor.name : "UnknownError";
    throw error;
  } finally {
    beat.running = false;
  }
}

export function workerHeartbeats(): WorkerHeartbeat[] {
  return [...beats.values()].map((b) => ({ ...b }));
}
