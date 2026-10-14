import Image from "next/image";
import Link from "next/link";
import { LockKeyhole, ShieldCheck } from "@petlife/ui";
import { notFound } from "next/navigation";
import { isAppLocale } from "@/lib/i18n/config";
import { parkCopy } from "@/features/landing/park-copy";
import { parkAuthCopy } from "@/features/auth/park-auth-copy";
import "@/features/auth/auth.css";
import "@/features/auth/park-auth.css";

export default async function AuthLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const c = parkAuthCopy[locale];
  return <div className="auth-frame park-auth-page">
    <aside className="auth-brand-panel" aria-label="PET LIFE OS">
      <Image unoptimized src={parkCopy[locale].imageSrc} alt="" fill sizes="(max-width: 820px) 100vw, 50vw" priority />
      <div className="auth-brand-copy">
        <Link href={`/${locale}`}><bdi>PET LIFE OS</bdi></Link>
        <h2>{c.tagline}</h2><p>{c.description}</p>
        <div className="auth-trust-row"><span><ShieldCheck size={16} aria-hidden="true" />{c.privacy}</span><span><LockKeyhole size={16} aria-hidden="true" />{c.title}</span></div>
      </div>
    </aside>
    <main className="auth-form-panel">{children}</main>
  </div>;
}
