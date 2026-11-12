"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { RouteLocale } from "@/lib/i18n/config";
import { CookieCursor } from "./CookieCursor";
import { HookBar } from "./HookBar";
import { prefersReducedMotion } from "./cursor-bus";

export type Species = "dog" | "cat" | "bird" | "rabbit" | "other";
type LandingState = {
  locale: RouteLocale;
  name: string;
  setName: (name: string) => void;
  species: Species;
  setSpecies: (species: Species) => void;
  cookieOn: boolean;
  setCookieOn: (on: boolean) => void;
};

const LandingContext = createContext<LandingState | null>(null);
const COOKIE_KEY = "opl-cookie-cursor";

export function useLanding(): LandingState {
  const value = useContext(LandingContext);
  if (!value) throw new Error("useLanding must be used inside LandingShell");
  return value;
}

/** Holds the visitor's pet name and the Cookie cursor switch for the whole landing below the hero. */
export function LandingShell({ locale, children, variant = "landing" }: { locale: RouteLocale; children: ReactNode; variant?: "landing" | "page" }) {
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<Species>("dog");
  const [cookieOn, setCookieOnState] = useState(false);
  useEffect(() => {
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(COOKIE_KEY); } catch { stored = null; }
    setCookieOnState(stored ? stored === "on" : !prefersReducedMotion());
  }, []);
  const value = useMemo<LandingState>(() => ({
    locale, name, setName, species, setSpecies, cookieOn,
    setCookieOn: (on: boolean) => {
      setCookieOnState(on);
      try { window.localStorage.setItem(COOKIE_KEY, on ? "on" : "off"); } catch { /* storage may be blocked */ }
    },
  }), [locale, name, species, cookieOn]);
  return <LandingContext.Provider value={value}>
    <div className={`${variant === "page" ? "opl-page" : "opl-landing"}${cookieOn ? " is-cookie" : ""}`}>
      {children}
      <HookBar />
      {cookieOn ? <CookieCursor /> : null}
    </div>
  </LandingContext.Provider>;
}
