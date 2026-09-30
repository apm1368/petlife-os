"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "@petlife/ui";
import type { UserDto } from "@petlife/types";
import { useAccountCopy } from "./account-copy";
import { useSignOut } from "./use-sign-out";

/** The avatar in the app header opens a small account menu: who is signed in, account shortcuts, and sign out. */
export function AccountMenu({ user }: { user: UserDto }) {
  const { t, locale } = useAccountCopy();
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={ref}>
      <button type="button" className="account-menu__trigger" aria-haspopup="menu" aria-expanded={open} aria-label={t("حساب کاربری", "Account")} onClick={() => setOpen((v) => !v)}>
        <Avatar name={user.displayName} src={user.avatarUrl} size="sm" />
      </button>
      {open ? (
        <div className="account-menu__panel" role="menu">
          <div className="account-menu__who">
            <b>{user.displayName}</b>
            {user.email || user.phone ? <small dir="ltr">{user.email ?? user.phone}</small> : null}
          </div>
          <Link role="menuitem" href={`/${locale}/profile`} onClick={() => setOpen(false)}>{t("حساب کاربری", "Account")}</Link>
          <Link role="menuitem" href={`/${locale}/profile/membership`} onClick={() => setOpen(false)}>{t("عضویت", "Membership")}</Link>
          <Link role="menuitem" href={`/${locale}/profile/security`} onClick={() => setOpen(false)}>{t("امنیت و دستگاه‌ها", "Security & devices")}</Link>
          <button
            role="menuitem"
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await signOut();
            }}
          >
            {busy ? t("در حال خروج…", "Signing out…") : t("خروج از حساب", "Sign out")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
