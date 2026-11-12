import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n/config";
import { SITE_ORIGIN } from "@/lib/seo/public-metadata";

/**
 * AI search and answer crawlers, named so the policy is explicit: they may read every public page (and
 * llms.txt) under the same private-route exclusions as everyone else. Training-only crawlers are not
 * singled out; they follow the default group.
 */
export const AI_CRAWLERS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User",
  "ClaudeBot", "Claude-SearchBot", "Claude-User", "anthropic-ai",
  "PerplexityBot", "Perplexity-User",
  "Google-Extended", "Applebot", "Applebot-Extended", "Bingbot", "DuckAssistBot", "YouBot", "MistralAI-User", "CCBot",
];

/** Public discovery is crawlable; accounts, carts, orders and every console are not. */
export default function robots(): MetadataRoute.Robots {
  const privatePaths = ["cart", "checkout", "orders", "repeat-delivery", "favorites", "profile", "account", "auth", "register", "welcome", "pets", "bookings", "notifications", "support", "admin", "seller", "provider", "home", "onboarding", "subscription", "care-calendar", "invitations", "insurer", "travel/trips", "travel/bookings", "travel/book", "travel/favorites", "ngo", "donations", "health-share", "pet-card", "community/messages", "animal-support/my-help", "animal-support/needs/mine", "animal-support/needs/new"];
  const disallow = privatePaths.flatMap((p) => locales.map((locale) => `/${locale}/${p}`));
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      { userAgent: AI_CRAWLERS, allow: ["/", "/llms.txt", "/llms-full.txt"], disallow },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
