import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, locales } from "./lib/i18n/config";

const intl = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: "always",
});

const localeSet = new Set<string>(locales);

/**
 * One URL per page:
 * - The bare domain is the Persian landing itself (served in place, no redirect), whatever the browser's
 *   language — the owner's canonical entry. `/fa` therefore permanently redirects to `/`, so the Persian
 *   home is never reachable at two addresses.
 * - A locale prefix in the wrong case (`/FA/blog`) permanently redirects to the lowercase one.
 * - Unprefixed paths keep next-intl's temporary, language-negotiated redirect (`/blog` → `/fa/blog` or the
 *   visitor's chosen language), which is what search engines expect for locale-adaptive redirects.
 */
export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = `/${defaultLocale}`;
    return NextResponse.rewrite(url);
  }

  if (pathname === `/${defaultLocale}`) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url, 308);
  }

  const [, first = "", ...rest] = pathname.split("/");
  const lowered = first.toLowerCase();
  if (first !== lowered && localeSet.has(lowered)) {
    const url = request.nextUrl.clone();
    url.pathname = lowered === defaultLocale && rest.filter(Boolean).length === 0 ? "/" : `/${[lowered, ...rest].join("/")}`;
    return NextResponse.redirect(url, 308);
  }

  return intl(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
