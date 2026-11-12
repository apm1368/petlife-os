import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

// Handoff 20 hardening: NEXT_PUBLIC_API_ORIGIN is inlined at build time
// (lib/api/client.ts defaults it to http://localhost:4000 for local dev). A
// production build that omits it would silently ship pointing at
// localhost — fail the build loudly instead of shipping that.
if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_API_ORIGIN) {
  throw new Error("NEXT_PUBLIC_API_ORIGIN must be set for a production build — omitting it would silently point the deployed app at http://localhost:4000.");
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@petlife/ui", "@petlife/design-tokens", "@petlife/types", "@petlife/validation"],
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        // Framing, plugins and <base> only: do not pretend this is a complete script CSP or block
        // current inline hydration, signed document previews or QR camera use.
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'" },
      ],
    }];
  },
  // Only the site's own static images go through the optimizer; every remote or uploaded image is rendered with
  // `unoptimized`. No remotePatterns, so /_next/image cannot be used to fetch arbitrary or internal URLs (blind
  // SSRF / port probing through localhost:4000, or redirects to it), and one quality so it cannot be made to
  // re-encode the same image over and over.
  images: {
    qualities: [75],
  },
};

export default withNextIntl(nextConfig);
