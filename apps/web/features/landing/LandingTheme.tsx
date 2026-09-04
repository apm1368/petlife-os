"use client";

import { useEffect, useState } from "react";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { Monitor } from "@petlife/ui";

export function LandingTheme() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // The existing head script already applies the saved colors before paint.
  // Mount the shared control on the client so its selected option reflects
  // localStorage rather than retaining the server's SYSTEM option.
  return (
    <div className="landing-theme-control">
      {mounted ? <ThemeToggle /> : <Monitor size={20} aria-hidden="true" />}
    </div>
  );
}
