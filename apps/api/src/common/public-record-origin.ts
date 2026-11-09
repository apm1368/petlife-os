/** Public production reads must never turn development fixtures into real-looking content. */
export function excludeDemoRecordsFromPublicReads(): { isDemoRecord: false } | Record<string, never> {
  // The production deploy contract explicitly sets DEPLOYMENT_ENVIRONMENT.
  // NODE_ENV is not currently exported by that pipeline and defaults to
  // development, so checking it alone silently exposed fixtures in production.
  const isProduction =
    process.env.NODE_ENV === "production" || process.env.DEPLOYMENT_ENVIRONMENT === "production";
  return isProduction ? { isDemoRecord: false } : {};
}
