import { statusLabel } from "@/lib/status/status-labels";

/** Health record status/flag codes → words via the shared vocabulary (lab meanings first; generic otherwise). */
export function recordStatusLabel(code: string, fa: boolean): string;
export function recordStatusLabel(code: string | null | undefined, fa: boolean): string | null;
export function recordStatusLabel(code: string | null | undefined, fa: boolean): string | null {
  if (!code) return null;
  return statusLabel(code, fa ? "fa" : "en", code === "NORMAL" || code === "ABNORMAL" ? "labFlag" : "lab");
}
