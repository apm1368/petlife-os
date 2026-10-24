"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { forwardRef, useMemo, type ComponentProps } from "react";

/** Prefixes the active locale to an internal path that has none ("/pets/1" → "/en/pets/1"); everything else is untouched. */
export function localizeHref(href: string, locale: string): string {
  if (!href.startsWith("/") || href.startsWith("//") || /^\/(fa|en)(\/|$|\?|#)/.test(href) || /^\/(api|_next|uploads)\//.test(href)) return href;
  return `/${locale}${href}`;
}

/**
 * Drop-in for next/link: a locale-less internal href would otherwise be resolved by the middleware from the cookie /
 * Accept-Language, so an English page could link into Persian (and always costs an extra redirect).
 */
const LocalizedLink = forwardRef<HTMLAnchorElement, ComponentProps<typeof NextLink>>(function LocalizedLink({ href, ...rest }, ref) {
  const locale = useLocale() === "en" ? "en" : "fa";
  const target = typeof href === "string" ? localizeHref(href, locale) : href;
  return <NextLink ref={ref} href={target} {...rest} />;
});
export default LocalizedLink;

/** useRouter with the same locale prefixing for push/replace/prefetch. */
export function useLocalizedRouter() {
  const router = useRouter();
  const locale = useLocale() === "en" ? "en" : "fa";
  return useMemo(() => ({
    ...router,
    push: (href: string, options?: Parameters<typeof router.push>[1]) => (options === undefined ? router.push(localizeHref(href, locale)) : router.push(localizeHref(href, locale), options)),
    replace: (href: string, options?: Parameters<typeof router.replace>[1]) => (options === undefined ? router.replace(localizeHref(href, locale)) : router.replace(localizeHref(href, locale), options)),
    prefetch: (href: string) => router.prefetch(localizeHref(href, locale)),
  }), [router, locale]);
}
