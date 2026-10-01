"use client";
import { SystemState, systemStateFor } from "./SystemState";

/**
 * What a page shows when its main record didn't load: not found, no access,
 * access ended, sign-in needed — or, only for a genuine transient failure, a
 * retry. The API's message is never shown (it isn't written for this place),
 * and a missing or forbidden record never offers a pointless Retry.
 */
export function LoadFailure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const kind = systemStateFor(error);
  // Only ever rendered after a client-side fetch failed, so the location is known.
  const returnTo = typeof window === "undefined" ? undefined : window.location.pathname + window.location.search;
  return <SystemState kind={kind} onRetry={kind === "GENERIC_RETRYABLE_ERROR" ? onRetry : undefined} returnTo={returnTo} />;
}
