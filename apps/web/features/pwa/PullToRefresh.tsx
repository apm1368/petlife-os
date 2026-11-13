"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "@petlife/ui";
import { isStandalone } from "./pwa-runtime";
import "./pwa.css";

const THRESHOLD = 72;
const MAX_PULL = 110;

/**
 * Pull to refresh, only where it is cheap and missing: inside the installed app on a touch phone (standalone windows
 * have no browser pull-to-refresh). It reloads the page, which re-runs every query the page makes. In a normal
 * browser tab the browser's own gesture stays in charge, so nothing is attached there.
 */
export function PullToRefresh() {
  const t = useTranslations("pwa.refresh");
  const [enabled, setEnabled] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef<{ y: number; x: number } | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    setEnabled(isStandalone() && window.matchMedia("(pointer: coarse) and (max-width: 768px)").matches);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const blocked = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return true;
      if (target.closest("dialog[open], [role=dialog], input, textarea, select, [contenteditable=true], .opl-family-reel, [data-no-pull]")) return true;
      // Inside a scrolled inner list, the gesture belongs to that list.
      for (let el: Element | null = target; el && el !== document.body; el = el.parentElement) {
        if (el.scrollTop > 0) return true;
      }
      return false;
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || window.scrollY > 0 || blocked(e.target)) return void (start.current = null);
      start.current = { y: e.touches[0]!.clientY, x: e.touches[0]!.clientX };
    };
    const onMove = (e: TouchEvent) => {
      if (!start.current) return;
      const dy = e.touches[0]!.clientY - start.current.y;
      const dx = Math.abs(e.touches[0]!.clientX - start.current.x);
      if (dy <= 0 || dx > dy || window.scrollY > 0) {
        if (pullRef.current) setPull((pullRef.current = 0));
        return;
      }
      const eased = Math.min(MAX_PULL, dy * 0.5);
      pullRef.current = eased;
      setPull(eased);
    };
    const onEnd = () => {
      if (!start.current) return;
      start.current = null;
      if (pullRef.current >= THRESHOLD) {
        setRefreshing(true);
        window.location.reload();
      } else {
        setPull((pullRef.current = 0));
      }
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled]);

  if (!enabled || (pull === 0 && !refreshing)) return null;
  const ready = pull >= THRESHOLD;
  const label = refreshing ? t("loading") : ready ? t("release") : t("pull");
  return (
    <div className="opl-ptr" style={{ transform: `translate(-50%, ${refreshing ? THRESHOLD : pull}px)` }} role="status" aria-live="polite">
      <span className={`opl-ptr__spinner${refreshing ? " is-spinning" : ""}`} style={{ transform: `rotate(${pull * 3}deg)` }} aria-hidden="true">
        <RefreshCw size={20} />
      </span>
      <span className="opl-ptr__label">{label}</span>
    </div>
  );
}
