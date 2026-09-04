"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MotionConfig, useAnimate, useReducedMotion } from "motion/react";

/** Opacity only: fixed navigation stays viewport-relative and forms never remount. */
export function PageMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLDivElement>();

  useEffect(() => {
    if (reducedMotion || !scope.current) return;
    const element = scope.current;
    const animation = animate(element, { opacity: [0.85, 1] }, { duration: 0.18 });
    return () => {
      animation.stop();
      element.style.opacity = "1";
    };
  }, [pathname, reducedMotion, animate, scope]);

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.18 }}>
      <div ref={scope}>{children}</div>
    </MotionConfig>
  );
}
