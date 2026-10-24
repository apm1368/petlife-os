"use client";

import { useState } from "react";
import { cn } from "./cn";

export interface AvatarProps {
  src?: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "h-8 w-8 text-metadata",
  md: "h-11 w-11 text-body",
  lg: "h-16 w-16 text-section-title",
};

function initials(name: string): string {
  // Only words that start with a letter count ("سارا (QA)" → "س", not "س)").
  const parts = name.trim().split(/\s+/).filter((part) => /^\p{L}/u.test(part));
  const [first, second] = parts;
  if (!first) return "?";
  // Persian/Arabic script reads better as one letter; Latin names get two.
  if (/^[\u0600-\u06FF]/.test(first)) return first[0]!;
  return (first[0]! + (second?.[0] ?? "")).toUpperCase();
}

export function Avatar({ src, name, size = "md", className }: AvatarProps) {
  // A missing or broken photo falls back to initials instead of a broken-image icon.
  const [failed, setFailed] = useState<string | null>(null);
  if (src && failed !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        onError={() => setFailed(src)}
        className={cn("rounded-full object-cover", sizeClasses[size], className)}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={name}
      className={cn(
        "flex items-center justify-center rounded-full bg-brand-solid font-semibold text-on-brand",
        sizeClasses[size],
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}
