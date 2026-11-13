import { humanShirtPath } from "./garment-geometry";

/**
 * "Where to measure" drawings (owner, 2026-11-13), drawn in-house. The numbers match the measurement fields:
 * 1 neck girth, 2 chest girth just behind the front legs, 3 back length from the base of the neck to the base of the tail.
 */
export function PetMeasureGuide({ title }: { title: string }) {
  return (
    <svg className="setpet-guide" viewBox="0 0 200 124" role="img" aria-label={title} dir="ltr">
      <g className="setpet-guide__animal">
        <path d="M44 50 Q28 40 20 22" fill="none" strokeWidth="6" strokeLinecap="round" />
        <ellipse cx="95" cy="64" rx="56" ry="25" />
        <path d="M132 52 Q146 40 148 26 L166 50 Q154 64 142 72 Z" />
        <circle cx="160" cy="36" r="16" />
        <ellipse cx="176" cy="43" rx="11" ry="7" />
        <path d="M150 24 Q146 8 156 6 Q160 16 160 24 Z" />
        <rect x="124" y="76" width="10" height="38" rx="5" />
        <rect x="138" y="74" width="10" height="40" rx="5" />
        <rect x="50" y="76" width="10" height="38" rx="5" />
        <rect x="64" y="78" width="10" height="36" rx="5" />
      </g>
      <g className="setpet-guide__lines" fill="none" strokeWidth="2.2" strokeDasharray="4 3">
        <ellipse cx="150" cy="48" rx="6" ry="14" transform="rotate(-32 150 48)" />
        <ellipse cx="118" cy="64" rx="7" ry="27" />
        <path d="M142 38 Q95 30 46 47" strokeDasharray="none" markerStart="url(#setpet-tick)" markerEnd="url(#setpet-tick)" />
      </g>
      <defs>
        <marker id="setpet-tick" viewBox="0 0 4 10" refX="2" refY="5" markerWidth="2" markerHeight="5" orient="auto">
          <rect width="4" height="10" className="setpet-guide__tick" />
        </marker>
      </defs>
      <g className="setpet-guide__badges">
        <circle cx="168" cy="72" r="8" /><text x="168" y="76">1</text>
        <circle cx="104" cy="104" r="8" /><text x="104" y="108">2</text>
        <circle cx="95" cy="22" r="8" /><text x="95" y="26">3</text>
      </g>
    </svg>
  );
}

/** The T-shirt chart: A = chest width laid flat (armpit to armpit), B = length (shoulder to hem). */
export function ShirtMeasureGuide({ title }: { title: string }) {
  return (
    <svg className="setpet-guide" viewBox="-44 -6 88 84" role="img" aria-label={title} dir="ltr">
      <path className="setpet-guide__shirt" d={humanShirtPath("M", "front")} />
      <g className="setpet-guide__lines" fill="none" strokeWidth="1.2">
        <path d="M-25.5 24 H25.5" markerStart="url(#setpet-tick-s)" markerEnd="url(#setpet-tick-s)" />
        <path d="M14 2 V72" markerStart="url(#setpet-tick-s)" markerEnd="url(#setpet-tick-s)" />
      </g>
      <defs>
        <marker id="setpet-tick-s" viewBox="0 0 4 10" refX="2" refY="5" markerWidth="2.4" markerHeight="6" orient="auto">
          <rect width="4" height="10" className="setpet-guide__tick" />
        </marker>
      </defs>
      <g className="setpet-guide__badges setpet-guide__badges--small">
        <circle cx="-6" cy="30" r="4.5" /><text x="-6" y="32.2">A</text>
        <circle cx="20" cy="48" r="4.5" /><text x="20" y="50.2">B</text>
      </g>
    </svg>
  );
}
