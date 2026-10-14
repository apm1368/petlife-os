"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import Image from "next/image";
import { PawPrint, LockKeyhole, X } from "@petlife/ui";
import { isAppLocale } from "@/lib/i18n/config";
import { useAuthModalOrigin } from "./AuthModalOrigin";
import { parkCopy } from "@/features/landing/park-copy";
import { parkAuthCopy } from "./park-auth-copy";
import "./auth.css";
import "./park-auth.css";

/** Intercepted auth routes render the existing flows, not a second auth implementation. */
export function ParkAuthModal({ children, registration = false }: { children: ReactNode; registration?: boolean }) {
  const router = useRouter();
  const locale = useLocale();
  const origin = useAuthModalOrigin();
  const c = parkAuthCopy[isAppLocale(locale) ? locale : "fa"];
  const ref = useRef<HTMLDialogElement>(null);
  const dismissing = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    const originalOverflow = document.body.style.overflow;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
      document.body.style.overflow = originalOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  function dismiss() {
    if (dismissing.current) return;
    dismissing.current = true;
    router.replace(origin ?? `/${locale}`, { scroll: false });
  }

  return <dialog ref={ref} className="park-auth" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); dismiss(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dismiss();
    }}>
    <h2 id={titleId} className="sr-only">{registration ? c.register : c.title}</h2>
    <div className="park-auth__grid">
      <aside className="park-auth__scene" aria-label="PET LIFE OS">
        <Image unoptimized src={parkCopy[isAppLocale(locale) ? locale : "fa"].imageSrc} alt="" fill sizes="340px" />
        <div className="park-auth__scene-copy"><PawPrint size={27} aria-hidden="true" /><h3>{c.tagline}</h3><p>{c.description}</p></div>
      </aside>
      <div className="park-auth__panel">
        <div className="park-auth__top"><bdi>PET LIFE OS</bdi><button type="button" onClick={dismiss} aria-label={c.close}><X size={21} aria-hidden="true" /></button></div>
        <div className="park-auth__flow">{children}</div>
        <p className="park-auth__privacy"><LockKeyhole size={14} aria-hidden="true" />{c.privacy}</p>
      </div>
    </div>
  </dialog>;
}
