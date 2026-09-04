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
  transpilePackages: ["@petlife/ui", "@petlife/design-tokens", "@petlife/types", "@petlife/validation"],
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default withNextIntl(nextConfig);
