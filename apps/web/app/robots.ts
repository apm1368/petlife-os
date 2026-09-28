import type { MetadataRoute } from "next";

/** Public discovery is crawlable; accounts, carts, orders and every console are not. */
export default function robots(): MetadataRoute.Robots {
  const privatePaths = ["cart", "checkout", "orders", "repeat-delivery", "favorites", "profile", "account", "pets", "bookings", "notifications", "support", "admin", "seller", "provider", "home", "onboarding", "subscription", "care-calendar", "invitations", "insurer", "travel/trips", "travel/bookings", "travel/book", "travel/favorites"];
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: privatePaths.flatMap((p) => [`/fa/${p}`, `/en/${p}`]) }],
  };
}
