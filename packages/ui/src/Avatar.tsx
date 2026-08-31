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
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const [first, second] = parts;
  return ((first?.[0] ?? "") + (second?.[0] ?? "")).toUpperCase() || (first?.[0]?.toUpperCase() ?? "?");
}

export function Avatar({ src, name, size = "md", className }: AvatarProps) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={cn("rounded-full object-cover", sizeClasses[size], className)}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={name}
      className={cn(
        "flex items-center justify-center rounded-full bg-brand-natural font-semibold text-text-inverse",
        sizeClasses[size],
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}
