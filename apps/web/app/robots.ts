import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n/config";
import { SITE_ORIGIN } from "@/lib/seo/public-metadata";

/** Public discovery is crawlable; accounts, carts, orders and every console are not. */
export default function robots(): MetadataRoute.Robots {
  const privatePaths = ["cart", "checkout", "orders", "repeat-delivery", "favorites", "profile", "account", "auth", "register", "welcome", "pets", "bookings", "notifications", "support", "admin", "seller", "provider", "home", "onboarding", "subscription", "care-calendar", "invitations", "insurer", "travel/trips", "travel/bookings", "travel/book", "travel/favorites", "ngo", "donations", "health-share", "pet-card", "community/messages", "animal-support/my-help", "animal-support/needs/mine", "animal-support/needs/new"];
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: privatePaths.flatMap((p) => locales.map((locale) => `/${locale}/${p}`)) }],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
