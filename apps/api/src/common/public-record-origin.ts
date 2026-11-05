/** Public production reads must never turn development fixtures into real-looking content. */
export function excludeDemoRecordsFromPublicReads(): { isDemoRecord: false } | Record<string, never> {
  return process.env.NODE_ENV === "production" ? { isDemoRecord: false } : {};
}
