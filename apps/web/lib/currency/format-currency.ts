/**
 * IRR is the financial source of truth everywhere (Prisma columns, API
 * payloads) — always a plain integer, never a float (spec section 44). The
 * UI is the one place Toman is ever shown, and only as a display
 * transform: 1 Toman = 10 Rial is a well-defined, non-ambiguous conversion
 * (never a real-time exchange rate), so dividing by 10 here is safe in a
 * way a currency conversion never would be.
 */
export function formatCurrency(amountRial: number, locale: "fa" | "en"): string {
  const toman = Math.round(amountRial / 10);
  const formatted = toman.toLocaleString(locale === "fa" ? "fa-IR" : "en-US");
  return locale === "fa" ? `${formatted} تومان` : `${formatted} Toman`;
}
