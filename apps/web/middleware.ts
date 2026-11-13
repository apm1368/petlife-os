import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, locales } from "./lib/i18n/config";
import { serviceCategoryFromSlug, serviceCategorySlug } from "./lib/services/category-slug";

const intl = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: "always",
  // Pages declare their own hreflang alternates in <head> (articles have a different slug per language). next-intl's
  // generated `Link` header assumed the same path in every locale and contradicted them, so it is off.
  alternateLinks: false,
});

const localeSet = new Set<string>(locales);

/** The served language for crawlers and caches, also on documents without a usable <html lang> (e.g. a 404 shell). */
function withContentLanguage(response: NextResponse, pathname: string) {
  const first = pathname.split("/")[1] ?? "";
  if (localeSet.has(first) && !response.headers.has("location")) response.headers.set("Content-Language", first);
  return response;
}

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
    return withContentLanguage(NextResponse.rewrite(url), url.pathname);
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

  // Service categories are lowercase slugs (/services/pet-taxi); enum spellings (/services/PET_TAXI) 308 there.
  if (localeSet.has(first) && rest[0] === "services" && rest[1]) {
    const code = serviceCategoryFromSlug(rest[1]);
    if (code && rest[1] !== serviceCategorySlug(code)) {
      const url = request.nextUrl.clone();
      url.pathname = `/${[first, "services", serviceCategorySlug(code), ...rest.slice(2)].join("/")}`;
      return NextResponse.redirect(url, 308);
    }
  }

  return withContentLanguage(intl(request), pathname);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
