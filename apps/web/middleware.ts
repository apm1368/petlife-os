import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, locales } from "./lib/i18n/config";

const intl = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: "always",
});

/**
 * The bare domain is the Persian landing itself (served in place, no redirect), whatever the
 * browser's language — the owner's canonical entry. Every other page keeps its /fa or /en prefix.
 */
export default function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = `/${defaultLocale}`;
    return NextResponse.rewrite(url);
  }
  return intl(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
