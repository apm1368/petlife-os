"use client";

import Link from "next/link";
import { SiteContact, SiteFooterNote, SocialLinks } from "./SiteContact";
import { useHrefFilter } from "./site-settings";

/** A footer link group with switched-off product areas removed (features.*). Hides itself when emptied. */
export function FooterLinkGroup({ title, links, locale }: { title: string; links: { label: string; href: string }[]; locale: string }) {
  const enabled = useHrefFilter();
  const visible = links.filter((l) => enabled(l.href));
  if (!visible.length) return null;
  return (
    <nav aria-label={title}>
      <h2>{title}</h2>
      <ul>{visible.map((link) => <li key={link.href}><Link href={`/${locale}${link.href}`}>{link.label}</Link></li>)}</ul>
    </nav>
  );
}

/** Admin-managed footer extras: contact facts, social profiles and the footer note. */
export function FooterSiteDetails() {
  return (
    <>
      <SiteContact />
      <SocialLinks />
      <SiteFooterNote />
    </>
  );
}
