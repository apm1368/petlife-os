import Image from "next/image";
import Link from "next/link";
import { LockKeyhole, ShieldCheck } from "@petlife/ui";
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
          src="/images/experience/auth-hero.png"
          alt=""
          fill
          sizes="(max-width: 760px) 100vw, 50vw"
          priority
        />
        <div className="auth-brand-copy">
          <Link href={`/${locale}`} dir="ltr">
            PET LIFE OS
          </Link>
          <h1>
            {locale === "fa"
              ? "زندگی بهتر برای شما و همراهتان، از همین‌جا شروع می‌شود"
              : "A better life for you and your companion starts here."}
          </h1>
          <p>{locale === "fa" ? "پرونده سلامت، رزرو، خرید و خاطرات؛ امن و همیشه در دسترس." : "Health records, bookings, shopping and memories—secure and always available."}</p>
          <div className="auth-trust-row"><span><ShieldCheck size={16} aria-hidden="true" />{locale === "fa" ? "حریم خصوصی پیش‌فرض" : "Private by default"}</span><span><LockKeyhole size={16} aria-hidden="true" />{locale === "fa" ? "ورود امن" : "Secure sign-in"}</span></div>
        </div>
      </aside>
      <main className="auth-form-panel">{children}</main>
    </div>
  );
}
