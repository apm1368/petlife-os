/**
 * Original vector scenes for the landing — one illustration language (flat shapes, no outlines,
 * warm paper palette) whose colours come from `--sc-*` tokens in landing.css, so light and dark
 * are designed palettes rather than a filter. Landmarks are physical artwork: they never mirror
 * with locale. Every scene is decorative-with-a-label: `role="img"` + a localized aria-label.
 */

function Cypress({ x, y, h = 120 }: { x: number; y: number; h?: number }) {
  const w = h * 0.2;
  return (
    <g>
      <rect x={x - 2} y={y - 10} width="4" height="12" className="sc-trunk" />
      <path d={`M${x},${y - h} C${x + w},${y - h * 0.7} ${x + w},${y - h * 0.15} ${x},${y - 8} C${x - w},${y - h * 0.15} ${x - w},${y - h * 0.7} ${x},${y - h}Z`} className="sc-cypress" />
    </g>
  );
}

function RoundTree({ x, y, r = 34, alt = false }: { x: number; y: number; r?: number; alt?: boolean }) {
  return (
    <g>
      <rect x={x - 3} y={y - r * 0.6} width="6" height={r * 0.7} className="sc-trunk" />
      <circle cx={x} cy={y - r * 1.1} r={r} className={alt ? "sc-tree-b" : "sc-tree-a"} />
      <circle cx={x - r * 0.55} cy={y - r * 0.8} r={r * 0.62} className={alt ? "sc-tree-b" : "sc-tree-a"} />
      <circle cx={x + r * 0.6} cy={y - r * 0.85} r={r * 0.58} className={alt ? "sc-tree-a" : "sc-tree-b"} />
    </g>
  );
}

/** Sitting cat, origin at the paws. */
function SittingCat({ x, y, tone, flip = false }: { x: number; y: number; tone: "a" | "b"; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`} className={`sc-cat-${tone}`}>
      <path d="M-11,0 C-14,-12 -11,-24 -2,-28 C6,-31 13,-26 13,-16 C13,-8 12,-3 10,0Z" />
      <circle cx="1" cy="-33" r="9" />
      <path d="M-7,-37 L-6,-47 L-1,-41Z M3,-41 L8,-47 L9,-37Z" />
      <path d="M9,-3 C22,-2 25,-12 19,-19" fill="none" strokeWidth="4" strokeLinecap="round" className="sc-cat-tail" />
    </g>
  );
}

/** Loafing cat, origin at the belly. */
function LyingCat({ x, y, tone }: { x: number; y: number; tone: "a" | "b" }) {
  return (
    <g transform={`translate(${x} ${y})`} className={`sc-cat-${tone}`}>
      <ellipse cx="0" cy="-8" rx="20" ry="8.5" />
      <circle cx="-18" cy="-14" r="8" />
      <path d="M-25,-17 L-25,-27 L-19,-21Z M-16,-21 L-11,-27 L-11,-17Z" />
      <path d="M18,-5 C28,-4 30,2 24,4" fill="none" strokeWidth="4" strokeLinecap="round" className="sc-cat-tail" />
    </g>
  );
}

function Bench({ x, y, w = 130 }: { x: number; y: number; w?: number }) {
  return (
    <g className="sc-bench">
      <rect x={x} y={y - 30} width={w} height="6" rx="2" />
      <rect x={x} y={y - 44} width={w} height="5" rx="2" />
      <rect x={x + 8} y={y - 44} width="5" height="44" />
      <rect x={x + w - 13} y={y - 44} width="5" height="44" />
    </g>
  );
}

function Lamp({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 2} y={y - 92} width="4" height="92" className="sc-ink-soft" />
      <circle cx={x} cy={y - 96} r="18" className="sc-lamp-glow" />
      <rect x={x - 7} y={y - 104} width="14" height="12" rx="3" className="sc-lamp" />
    </g>
  );
}

function Walker({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* person */}
      <g className="sc-person">
        <circle cx="0" cy="-104" r="10" />
        <path d="M-12,-90 C-14,-70 -13,-55 -11,-46 L11,-46 C13,-58 13,-72 11,-90 C6,-94 -6,-94 -12,-90Z" className="sc-coat" />
        <path d="M-8,-46 L-14,0 L-7,0 L0,-34 L6,0 L13,0 L8,-46Z" />
        <path d="M10,-80 C18,-70 22,-62 26,-56" fill="none" strokeWidth="5" strokeLinecap="round" className="sc-coat-stroke" />
      </g>
      {/* leash */}
      <path d="M26,-56 C40,-40 48,-30 58,-26" fill="none" strokeWidth="1.6" className="sc-leash" />
      {/* dog */}
      <g className="sc-dog">
        <ellipse cx="74" cy="-18" rx="20" ry="9" />
        <circle cx="94" cy="-27" r="8" />
        <path d="M98,-32 C104,-31 106,-26 102,-23" />
        <path d="M89,-33 C86,-25 84,-21 87,-19 C90,-21 91,-27 89,-33Z" className="sc-dog-ear" />
        <rect x="58" y="-14" width="4" height="14" rx="2" />
        <rect x="66" y="-12" width="4" height="12" rx="2" />
        <rect x="80" y="-12" width="4" height="12" rx="2" />
        <rect x="88" y="-14" width="4" height="14" rx="2" />
        <path d="M55,-20 C48,-26 47,-32 50,-36" fill="none" strokeWidth="4" strokeLinecap="round" className="sc-dog-tail" />
      </g>
    </g>
  );
}

function AzadiTower({ x, y }: { x: number; y: number }) {
  // Base 150 wide, 140 tall: a flared silhouette, the pointed central arch and the crown block.
  return (
    <g transform={`translate(${x - 75} ${y - 140})`}>
      <mask id="azadi-cut">
        <rect x="-10" y="-10" width="170" height="170" fill="#fff" />
        <path d="M44,140 C48,104 62,78 75,68 C88,78 102,104 106,140Z" fill="#000" />
        <path d="M66,46 C68,40 72,37 75,36 C78,37 82,40 84,46 L84,52 L66,52Z" fill="#000" />
      </mask>
      <g mask="url(#azadi-cut)" className="sc-azadi">
        <path d="M0,140 C26,116 42,70 50,26 L100,26 C108,70 124,116 150,140Z" />
        <rect x="46" y="8" width="58" height="22" rx="3" />
        <rect x="56" y="0" width="38" height="10" rx="2" />
      </g>
      <path d="M50,26 L100,26" strokeWidth="2" className="sc-azadi-line" />
    </g>
  );
}

function MiladTower({ x, y, h = 330 }: { x: number; y: number; h?: number }) {
  const top = y - h;
  return (
    <g className="sc-milad">
      <path d={`M${x - 26},${y} L${x - 7},${y - 70} L${x + 7},${y - 70} L${x + 26},${y}Z`} />
      <rect x={x - 6} y={top + 120} width="12" height={h - 190} />
      <rect x={x - 32} y={top + 82} width="64" height="34" rx="12" />
      <ellipse cx={x} cy={top + 118} rx="40" ry="8" />
      <ellipse cx={x} cy={top + 82} rx="30" ry="7" />
      <rect x={x - 4} y={top + 34} width="8" height="50" />
      <rect x={x - 1} y={top} width="2" height="36" />
      <rect x={x - 28} y={top + 96} width="56" height="4" className="sc-milad-band" />
    </g>
  );
}

const SKYLINE: [number, number, number][] = [
  [40, 46, 54], [92, 30, 38], [126, 52, 66], [184, 40, 46], [228, 64, 34], [470, 52, 52], [526, 40, 70],
  [570, 70, 40], [644, 34, 58], [684, 50, 44], [740, 40, 76], [784, 60, 42], [848, 36, 60], [888, 48, 50],
  [1060, 44, 64], [1108, 56, 48], [1170, 40, 70], [1214, 62, 40], [1280, 38, 58], [1322, 54, 46], [1380, 50, 62],
];

/** Hero: a Tehran park at the foot of Alborz, Azadi and Milad on the skyline. */
export function TehranScene({ label, className }: { label: string; className?: string }) {
  return (
    <svg viewBox="0 0 1440 720" role="img" aria-label={label} className={className} preserveAspectRatio="xMidYMax slice">
      <defs>
        <linearGradient id="sc-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.3" className="sc-sky-top" />
          <stop offset="1" className="sc-sky-low" />
        </linearGradient>
      </defs>
      <rect width="1440" height="720" fill="url(#sc-sky)" />
      <circle cx="1150" cy="236" r="48" className="sc-sun" />
      <g className="sc-bird" fill="none" strokeWidth="2" strokeLinecap="round">
        <path d="M300,214 q8,-7 16,0 q8,-7 16,0" />
        <path d="M352,196 q6,-5 12,0 q6,-5 12,0" />
        <path d="M900,180 q6,-5 12,0 q6,-5 12,0" />
      </g>
      {/* Alborz, far range with snow */}
      <path d="M0,330 L110,280 L200,310 L320,226 L420,280 L520,214 L640,272 L760,196 L880,262 L990,222 L1100,282 L1230,240 L1340,286 L1440,256 L1440,500 L0,500Z" className="sc-mountain-far" />
      <path d="M296,243 L320,226 L344,243 L332,240 L320,248 L308,239Z M498,230 L520,214 L543,231 L530,228 L520,236 L509,227Z M734,214 L760,196 L787,215 L772,212 L760,221 L747,211Z M968,238 L990,222 L1012,238 L1000,235 L990,243 L979,234Z" className="sc-snow" />
      <path d="M0,380 C160,330 300,360 420,338 C560,312 700,350 860,322 C1020,296 1180,340 1440,318 L1440,500 L0,500Z" className="sc-mountain" />
      {/* city */}
      <g className="sc-city">
        {SKYLINE.map(([x, w, h]) => <rect key={x} x={x} y={470 - h} width={w} height={h + 30} />)}
      </g>
      <g className="sc-window">
        {SKYLINE.map(([x, w, h]) => <rect key={x} x={x + w / 2 - 3} y={470 - h + 12} width="6" height="5" />)}
      </g>
      <MiladTower x={1000} y={472} />
      <AzadiTower x={360} y={474} />
      {/* park */}
      <path d="M0,486 C260,462 560,500 860,478 C1100,460 1300,486 1440,474 L1440,720 L0,720Z" className="sc-grass-far" />
      <Cypress x={140} y={500} h={110} />
      <Cypress x={176} y={502} h={86} />
      <Cypress x={1262} y={494} h={104} />
      <Cypress x={1296} y={496} h={78} />
      <RoundTree x={560} y={500} r={30} />
      <RoundTree x={612} y={502} r={22} alt />
      <RoundTree x={880} y={494} r={28} alt />
      <path d="M0,586 C330,556 700,606 1060,572 C1250,556 1360,578 1440,568 L1440,720 L0,720Z" className="sc-grass-near" />
      <path d="M560,720 C590,650 720,610 920,598 C1080,588 1250,600 1440,610 L1440,650 C1240,640 1090,634 940,644 C790,654 690,690 676,720Z" className="sc-path" />
      {/* Persian garden pool */}
      <rect x="250" y="664" width="250" height="18" rx="9" className="sc-water" />
      <rect x="270" y="669" width="120" height="3" rx="1.5" className="sc-water-light" />
      <RoundTree x={76} y={640} r={44} />
      <RoundTree x={1372} y={642} r={46} alt />
      <Lamp x={520} y={640} />
      <Lamp x={1180} y={626} />
      <Bench x={250} y={640} />
      <SittingCat x={286} y={610} tone="a" />
      <LyingCat x={345} y={610} tone="b" />
      <Walker x={880} y={640} />
    </svg>
  );
}

/** Travel: a timber lodge in the Hyrcanian forest — the northern trip most Tehran families take. */
export function TravelScene({ label, className }: { label: string; className?: string }) {
  return (
    <svg viewBox="0 0 640 420" role="img" aria-label={label} className={className} preserveAspectRatio="xMidYMid slice">
      <rect width="640" height="420" className="sc-mist" />
      <path d="M0,200 C80,150 160,170 240,140 C330,106 420,150 520,120 C580,102 620,118 640,112 L640,420 L0,420Z" className="sc-mountain" />
      <path d="M0,250 C120,214 220,236 330,210 C440,186 540,220 640,200 L640,420 L0,420Z" className="sc-grass-far" />
      {[40, 90, 130, 520, 560, 600].map((x, i) => <Cypress key={x} x={x} y={262 + (i % 2) * 6} h={90 + (i % 3) * 18} />)}
      <path d="M0,330 C180,300 420,342 640,312 L640,420 L0,420Z" className="sc-grass-near" />
      {/* lodge */}
      <g>
        <rect x="236" y="214" width="170" height="96" className="sc-wood" />
        <path d="M222,218 L321,154 L420,218Z" className="sc-roof" />
        <rect x="300" y="250" width="34" height="60" className="sc-door" />
        <rect x="254" y="236" width="30" height="26" className="sc-window-warm" />
        <rect x="352" y="236" width="30" height="26" className="sc-window-warm" />
        <rect x="228" y="306" width="186" height="8" className="sc-roof" />
      </g>
      <path d="M318,314 C300,350 260,380 220,420 L300,420 C320,384 334,352 336,314Z" className="sc-path" />
      <SittingCat x={364} y={312} tone="a" />
      <g className="sc-bag">
        <rect x="408" y="282" width="34" height="30" rx="5" />
        <rect x="418" y="274" width="14" height="10" rx="3" fill="none" strokeWidth="3" className="sc-bag-handle" />
      </g>
    </svg>
  );
}

/** Memories: three stacked frames, each a tiny scene in the same palette. */
export function MemoryScene({ label, className }: { label: string; className?: string }) {
  return (
    <svg viewBox="0 0 560 420" role="img" aria-label={label} className={className}>
      <g transform="rotate(-6 150 230)">
        <rect x="60" y="110" width="190" height="230" rx="6" className="sc-frame" />
        <rect x="74" y="124" width="162" height="162" className="sc-sky-flat" />
        <rect x="74" y="230" width="162" height="56" className="sc-wood" />
        <rect x="100" y="140" width="110" height="80" className="sc-window-pane" />
        <rect x="153" y="140" width="4" height="80" className="sc-frame" />
        <SittingCat x={156} y={232} tone="b" />
        <rect x="90" y="304" width="90" height="8" rx="4" className="sc-caption" />
      </g>
      <g transform="rotate(5 410 220)">
        <rect x="316" y="96" width="190" height="230" rx="6" className="sc-frame" />
        <rect x="330" y="110" width="162" height="162" className="sc-sky-flat" />
        <path d="M330,230 C380,214 440,226 492,214 L492,272 L330,272Z" className="sc-grass-near" />
        <RoundTree x={460} y={232} r={20} />
        <g><g className="sc-dog">
          <ellipse cx="394" cy="244" rx="20" ry="9" />
          <circle cx="414" cy="235" r="8" />
          <rect x="378" y="248" width="4" height="14" rx="2" />
          <rect x="406" y="248" width="4" height="14" rx="2" />
        </g></g>
        <rect x="346" y="290" width="70" height="8" rx="4" className="sc-caption" />
      </g>
      <g>
        <rect x="190" y="40" width="180" height="210" rx="6" className="sc-frame" />
        <rect x="203" y="53" width="154" height="150" className="sc-plum-tint" />
        <rect x="248" y="140" width="64" height="40" rx="4" className="sc-cake" />
        <rect x="248" y="136" width="64" height="8" rx="3" className="sc-frame" />
        <rect x="278" y="118" width="4" height="18" className="sc-candle" />
        <circle cx="280" cy="112" r="5" className="sc-sun" />
        <rect x="214" y="216" width="80" height="8" rx="4" className="sc-caption" />
      </g>
    </svg>
  );
}

/** Community: two neighbours on a bench, a dog between them and a cat on the backrest. */
export function CommunityScene({ label, className }: { label: string; className?: string }) {
  return (
    <svg viewBox="0 0 560 360" role="img" aria-label={label} className={className} preserveAspectRatio="xMidYMax slice">
      <rect width="560" height="360" className="sc-sky-flat" />
      <path d="M0,250 C140,230 320,262 560,236 L560,360 L0,360Z" className="sc-grass-near" />
      <RoundTree x={70} y={262} r={46} />
      <RoundTree x={500} y={258} r={40} alt />
      <Bench x={170} y={300} w={220} />
      <g className="sc-person">
        <circle cx="225" cy="202" r="11" />
        <path d="M210,216 C206,240 208,256 212,268 L240,268 C243,252 244,236 240,216 C234,211 216,211 210,216Z" className="sc-coat" />
        <path d="M212,268 L246,270 L250,300 L242,300 L238,280 L212,280Z" />
      </g>
      <g className="sc-person">
        <circle cx="340" cy="200" r="11" />
        <path d="M325,214 C321,238 323,254 327,266 L355,266 C358,250 359,234 355,214 C349,209 331,209 325,214Z" className="sc-coat-b" />
        <path d="M355,266 L318,268 L314,300 L322,300 L326,280 L355,280Z" />
      </g>
      <g className="sc-dog" transform="translate(-14 26)">
        <ellipse cx="290" cy="262" rx="18" ry="8" />
        <circle cx="306" cy="252" r="7" />
        <rect x="276" y="266" width="4" height="12" rx="2" />
        <rect x="298" y="266" width="4" height="12" rx="2" />
      </g>
      <SittingCat x={372} y={256} tone="a" flip />
      <g className="sc-heart">
        <path d="M282,150 C282,140 296,138 298,148 C300,138 314,140 314,150 C314,162 298,170 298,174 C298,170 282,162 282,150Z" />
      </g>
    </svg>
  );
}

/** Small pet portrait for the identity strip. */
export function PetPortrait({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" aria-hidden="true" className={className}>
      <rect width="96" height="96" className="sc-plum-tint" />
      <g className="sc-cat-b">
        <path d="M20,96 C20,72 32,62 48,62 C64,62 76,72 76,96Z" />
        <circle cx="48" cy="46" r="22" />
        <path d="M28,36 L28,14 L42,28Z M54,28 L68,14 L68,36Z" />
      </g>
      <circle cx="40" cy="46" r="3" className="sc-eye" />
      <circle cx="56" cy="46" r="3" className="sc-eye" />
    </svg>
  );
}
