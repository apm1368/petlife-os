"use client";

import { useLanding } from "./LandingShell";
import { useOplCopy } from "./opl-copy";

/** Footer switch for the Cookie cursor; the choice is remembered on this device. */
export function CookieToggle() {
  const { cookieOn, setCookieOn } = useLanding();
  const c = useOplCopy().cookie;
  return <button type="button" className="opl-cookie-toggle" aria-pressed={cookieOn} onClick={() => setCookieOn(!cookieOn)}>{cookieOn ? c.hide : c.show}</button>;
}
