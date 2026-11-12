"use client";

import { useLanding } from "./LandingShell";
import { oplCopy } from "./opl-copy";

/** Footer switch for the Cookie cursor; the choice is remembered on this device. */
export function CookieToggle() {
  const { locale, cookieOn, setCookieOn } = useLanding();
  const c = oplCopy[locale].cookie;
  return <button type="button" className="opl-cookie-toggle" aria-pressed={cookieOn} onClick={() => setCookieOn(!cookieOn)}>{cookieOn ? c.hide : c.show}</button>;
}
