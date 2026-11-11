"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PawPrint, X } from "@petlife/ui";
import { useLanding } from "./LandingShell";
import { oplCopy, withName } from "./opl-copy";

/** A soft bottom bar that invites signup once the visitor has scrolled past the five worlds, until the final call. */
export function HookBar() {
  const { locale, name } = useLanding();
  const c = oplCopy[locale].hook;
  const [show, setShow] = useState(false);
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    const update = () => {
      const world = document.getElementById("park-about")?.getBoundingClientRect();
      const final = document.getElementById("opl-start")?.getBoundingClientRect();
      setShow(!!world && !!final && world.bottom < 0 && final.top > innerHeight * 0.7);
    };
    update();
    addEventListener("scroll", update, { passive: true });
    return () => removeEventListener("scroll", update);
  }, []);
  const visible = show && !closed;
  return <div className={`opl-hookbar${visible ? " show" : ""}`} aria-hidden={!visible} hidden={!visible}>
    <span className="opl-hookbar__paw"><PawPrint size={20} aria-hidden="true" /></span>
    <span className="opl-hookbar__t">{withName(c.text, name)}</span>
    <Link className="opl-btn primary sm" href={`/${locale}/register`} tabIndex={visible ? 0 : -1}>{c.start}</Link>
    <button type="button" className="opl-hookbar__x" aria-label={c.close} tabIndex={visible ? 0 : -1} onClick={() => setClosed(true)}><X size={16} aria-hidden="true" /></button>
  </div>;
}
