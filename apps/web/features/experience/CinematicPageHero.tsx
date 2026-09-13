import Image from "next/image";
import type { ReactNode } from "react";

export function CinematicPageHero({
  image,
  eyebrow,
  title,
  description,
  children,
  alt = "",
  compact = false,
}: {
  image: string;
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
  alt?: string;
  compact?: boolean;
}) {
  return (
    <section className={`experience-hero${compact ? " experience-hero--compact" : ""}`}>
      <Image src={image} alt={alt} fill priority sizes="(max-width: 768px) 100vw, 1180px" />
      <div className="experience-hero__shade" aria-hidden="true" />
      <div className="experience-hero__content">
        <p className="experience-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="experience-hero__description">{description}</p>
        {children ? <div className="experience-hero__actions">{children}</div> : null}
      </div>
    </section>
  );
}
