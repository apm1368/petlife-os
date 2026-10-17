"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import "./approved-patterns.css";

/** Shared visual rules reach every existing route without changing its role guards or API. */
export function routePattern(pathname: string) {
  const path = pathname.replace(/^\/(fa|en)(?=\/|$)/, "") || "/";
  if (path === "/") return "landing";
  if (/^\/admin\/(crm|customer-affairs)(\/|$)/.test(path)) return "protected";
  if (/^\/admin(\/|$)/.test(path)) return "admin";
  if (/^\/(provider|seller)(\/|$)/.test(path)) return "operations";
  if (/^\/(home|pets|profile|subscription|notifications|care-calendar|support)(\/|$)/.test(path)) return "personal";
  if (/^\/(blog|guides)(\/|$)/.test(path)) return "editorial";
  if (/^\/animal-support(\/|$)/.test(path)) return "classifieds";
  if (/^\/(vet|providers|services)(\/|$)/.test(path)) return /\/book\/?$/.test(path) ? "reservation" : "discovery";
  if (/^\/(bookings|travel)(\/|$)/.test(path)) return "reservation";
  if (/^\/(auth|register|welcome|account)(\/|$)/.test(path)) return "auth";
  return "service";
}

export function DesignRoot({ children }: { children: ReactNode }) {
  return <div className="design-root" data-pattern={routePattern(usePathname() ?? "/")}>{children}</div>;
}
