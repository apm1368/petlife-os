import Image from "next/image";
import Link from "next/link";
import "@/features/auth/auth.css";

export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <div className="auth-frame">
      <aside className="auth-brand-panel" aria-label="PET LIFE OS">
        <Image
          src="/images/landing/pet-portrait.png"
          alt=""
          fill
          sizes="(max-width: 760px) 100vw, 50vw"
          priority
        />
        <div>
          <Link href={`/${locale}`} dir="ltr">
            PET LIFE OS
          </Link>
          <p>
            {locale === "fa"
              ? "همه چیز برای زندگی بهتر شما و حیوان همراهتان"
              : "Everything for a better life for you and your pet."}
          </p>
        </div>
      </aside>
      <main className="auth-form-panel">{children}</main>
    </div>
  );
}
