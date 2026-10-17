/**
 * Wraps user/data text in Unicode first-strong isolates (FSI … PDI) before it is interpolated into a
 * sentence of the other direction — a Persian shop name inside "Sold by {seller}" on an English page
 * otherwise drags neighbouring digits and punctuation into its run ("Sold by 2 · …").
 */
export function isolate(text: string): string {
  return `⁨${text}⁩`;
}
