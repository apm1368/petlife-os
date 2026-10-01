import type { DestinationKey } from "./copy";

/**
 * A stylised Tehran skyline, drawn — not photographed — so it stays sharp, light (a few KB) and themeable:
 * every colour is a CSS variable (`landing.css`), daylight in light mode and an evening city in dark mode.
 * The Alborz ridge, Azadi Tower and Milad Tower anchor the place; six foreground buildings each stand for one
 * real PET LIFE destination. The art is decorative (aria-hidden) — navigation is the HTML links laid over it.
 *
 * Coordinates live in a 1600 × 600 world; the ground line is y = 540. Building geometry is exported so the
 * link overlay and the mobile tiles use the same numbers.
 */
export const WORLD = { width: 1600, height: 680, ground: 540 } as const;

/** `base` is the y of the object's foot — the street line for buildings, the park lawn for the memories board. */
export const BUILDINGS: Record<DestinationKey, { x: number; w: number; h: number; door: number; base?: number }> = {
  health: { x: 60, w: 190, h: 210, door: 70 },
  services: { x: 275, w: 165, h: 180, door: 66 },
  shop: { x: 770, w: 180, h: 170, door: 64 },
  travel: { x: 1060, w: 215, h: 150, door: 70 },
  animalSupport: { x: 1295, w: 150, h: 172, door: 62 },
  community: { x: 1462, w: 128, h: 205, door: 66 },
  memories: { x: 800, w: 150, h: 104, door: 18, base: 664 },
};

const RIDGE_BACK = "M0 330 L80 300 L170 320 L260 262 L340 300 L430 242 L520 286 L610 232 L700 272 L800 216 L900 262 L990 228 L1080 270 L1180 236 L1270 276 L1360 230 L1450 266 L1540 242 L1600 260 L1600 600 L0 600Z";
const RIDGE_FRONT = "M0 382 L120 352 L240 374 L360 342 L480 370 L600 347 L720 374 L860 352 L1000 377 L1140 354 L1280 380 L1420 357 L1600 374 L1600 600 L0 600Z";
const PEAKS: [number, number][] = [[260, 262], [430, 242], [610, 232], [800, 216], [990, 228], [1180, 236], [1360, 230], [1540, 242]];
// Deterministic far-city silhouette (no randomness at render time, so server and client agree).
const FAR_CITY = Array.from({ length: 46 }, (_, i) => {
  const h = 40 + ((i * 37) % 70) + (i % 5 === 0 ? 34 : 0);
  return { x: i * 35 - 6, w: 30 + ((i * 13) % 12), h };
});

function Windows({ cols, rows, x0, y0, w, h, gx, gy, className = "t-win" }: { cols: number; rows: number; x0: number; y0: number; w: number; h: number; gx: number; gy: number; className?: string }) {
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(<rect key={`${r}-${c}`} className={className} x={x0 + c * gx} y={y0 + r * gy} width={w} height={h} rx={2} />);
  return <>{out}</>;
}

/** Each building draws in its own box: origin at its bottom-left corner on the ground, y grows upwards (negative). */
export function BuildingArt({ kind }: { kind: DestinationKey }) {
  switch (kind) {
    case "health": // A clinic: calm ivory volume, mint band, a canopy over the entrance.
      return (
        <>
          <rect className="t-facade-health" x={0} y={-210} width={190} height={210} />
          <rect className="t-accent-mint" x={0} y={-210} width={190} height={20} />
          <path className="t-mark" d="M70 -200 h14 l6 -7 l7 14 l6 -7 h18" fill="none" strokeWidth={3} />
          <Windows cols={3} rows={3} x0={20} y0={-176} w={38} h={26} gx={56} gy={38} />
          <rect className="t-accent-green" x={52} y={-72} width={86} height={9} rx={2} />
          <rect className="t-door" x={78} y={-63} width={34} height={63} />
          <rect className="t-shade" x={150} y={-190} width={40} height={190} />
        </>
      );
    case "services": // A grooming & training studio: arched windows and a striped awning.
      return (
        <>
          <rect className="t-facade-services" x={0} y={-180} width={165} height={180} />
          <rect className="t-facade-dark" x={-6} y={-188} width={177} height={11} />
          {[18, 92].map((x) => [-160, -112].map((y) => <path key={`${x}${y}`} className="t-win" d={`M${x} ${y + 34} v-22 a27 18 0 0 1 54 0 v22 z`} />))}
          <path className="t-accent-violet" d="M36 -74 h93 l10 16 h-113z" />
          {[46, 66, 86, 106].map((x) => <rect key={x} className="t-stripe" x={x} y={-73} width={9} height={15} />)}
          <rect className="t-door" x={66} y={-58} width={33} height={58} />
          <rect className="t-shade" x={130} y={-177} width={35} height={177} />
        </>
      );
    case "shop": // A shop: sign band and a full-height glass storefront.
      return (
        <>
          <rect className="t-facade-shop" x={0} y={-170} width={180} height={170} />
          <Windows cols={4} rows={1} x0={16} y0={-150} w={30} h={34} gx={40} gy={0} />
          <rect className="t-accent-green" x={0} y={-96} width={180} height={18} />
          <rect className="t-glass" x={10} y={-70} width={160} height={70} />
          {[50, 90, 130].map((x) => <rect key={x} className="t-mullion" x={x} y={-70} width={3} height={70} />)}
          <rect className="t-door" x={72} y={-58} width={36} height={58} />
          <rect className="t-shade" x={145} y={-170} width={35} height={170} />
        </>
      );
    case "travel": // A travel terminal: a long vault and a clerestory band.
      return (
        <>
          <path className="t-accent-teal" d="M0 -100 Q107 -196 215 -100z" />
          <path className="t-glass" d="M28 -104 Q107 -168 187 -104z" />
          <rect className="t-facade-travel" x={0} y={-104} width={215} height={104} />
          <Windows cols={5} rows={1} x0={14} y0={-90} w={30} h={24} gx={40} gy={0} />
          <path className="t-door" d="M86 0 v-46 a21 21 0 0 1 42 0 v46z" />
          <rect className="t-shade" x={180} y={-104} width={35} height={104} />
        </>
      );
    case "animalSupport": // A shelter: pitched roof, round gable window, a low fence.
      return (
        <>
          <path className="t-accent-coral" d="M-6 -110 L75 -172 L156 -110z" />
          <rect className="t-facade-support" x={0} y={-112} width={150} height={112} />
          <circle className="t-win" cx={75} cy={-134} r={14} />
          <Windows cols={2} rows={1} x0={18} y0={-96} w={30} h={30} gx={84} gy={0} />
          <rect className="t-door" x={58} y={-62} width={34} height={62} />
          {[-24, -14, 164, 174].map((x) => <rect key={x} className="t-fence" x={x} y={-26} width={5} height={26} />)}
          <rect className="t-fence" x={-26} y={-22} width={30} height={3} />
          <rect className="t-fence" x={146} y={-22} width={32} height={3} />
          <rect className="t-shade" x={118} y={-112} width={32} height={112} />
        </>
      );
    case "community": // A civic hall: a shallow tiled dome and pointed Persian arches.
      return (
        <>
          <path className="t-accent-turq" d="M12 -122 Q64 -222 116 -122z" />
          <rect className="t-finial" x={62} y={-212} width={4} height={14} />
          <rect className="t-facade-community" x={0} y={-124} width={128} height={124} />
          {[16, 52, 88].map((x) => <path key={x} className="t-win" d={`M${x} -64 v-28 q12 -18 24 0 v28z`} />)}
          <path className="t-door" d="M46 0 v-40 q18 -26 36 0 v40z" />
          <rect className="t-shade" x={98} y={-124} width={30} height={124} />
        </>
      );
    case "memories": // A photo board on the lawn: three pinned prints of moments, on a little easel.
      return (
        <>
          <rect className="t-trunk" x={18} y={-30} width={6} height={30} />
          <rect className="t-trunk" x={126} y={-30} width={6} height={30} />
          <rect className="t-board" x={0} y={-104} width={150} height={78} rx={6} />
          {[[12, -96, -4], [56, -98, 3], [100, -95, -2]].map(([x, y, r]) => (
            <g key={x} transform={`rotate(${r} ${x! + 19} ${y! + 26})`}>
              <rect className="t-print" x={x} y={y} width={38} height={50} rx={2} />
              <rect className={`t-photo t-photo-${x}`} x={x! + 4} y={y! + 4} width={30} height={32} />
              <circle className="t-photo-sun" cx={x! + 26} cy={y! + 12} r={4} />
            </g>
          ))}
          <circle className="t-pin" cx={31} cy={-94} r={2.6} />
          <circle className="t-pin" cx={75} cy={-96} r={2.6} />
          <circle className="t-pin" cx={119} cy={-93} r={2.6} />
        </>
      );
  }
}

/** A park bench, origin at its left foot on the lawn. */
function Bench({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect className="t-bench" x={0} y={-22} width={70} height={6} rx={2} />
      <rect className="t-bench" x={0} y={-36} width={70} height={5} rx={2} />
      <rect className="t-bench-leg" x={6} y={-16} width={4} height={16} />
      <rect className="t-bench-leg" x={60} y={-16} width={4} height={16} />
    </g>
  );
}

/** A sitting cat seen from the side; `flip` turns it to face the other way. */
function Cat({ x, y, tone = "a", flip = false }: { x: number; y: number; tone?: "a" | "b" | "c"; flip?: boolean }) {
  return (
    <g className={`t-cat t-cat-${tone}`} transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`}>
      <path d="M-9 0 C-12 -10 -8 -20 0 -21 C8 -20 11 -10 8 0Z" />
      <circle cx={2} cy={-25} r={7} />
      <path d="M-3 -30 L-4 -37 L1 -32Z M5 -31 L8 -37 L9 -30Z" />
      <path className="t-cat-tail" d="M7 -2 C16 -2 18 -10 14 -15" fill="none" strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}

/** A dog standing on the lawn. */
function Dog({ x, y }: { x: number; y: number }) {
  return (
    <g className="t-dog" transform={`translate(${x} ${y})`}>
      <rect x={-16} y={-22} width={30} height={13} rx={6} />
      <rect x={-14} y={-12} width={4} height={12} rx={1.5} />
      <rect x={6} y={-12} width={4} height={12} rx={1.5} />
      <circle cx={16} cy={-26} r={7} />
      <path d="M13 -31 L10 -24 L15 -26Z" />
      <path className="t-dog-tail" d="M-16 -18 L-23 -27" fill="none" strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}

function Azadi() {
  // Azadi Tower: the splayed, concave-sided gateway with its tall pointed arch and upper vault.
  return (
    <g className="t-landmark t-azadi">
      <path className="t-azadi-body" d="M480 540 C512 470 556 404 563 304 L566 270 L634 270 L637 304 C644 404 688 470 720 540Z" />
      <path className="t-azadi-cap" d="M570 270 L630 270 L624 251 L576 251Z" />
      <path className="t-azadi-shade" d="M600 270 L634 270 L637 304 C644 404 688 470 720 540 L655 540 L655 300Z" />
      <path className="t-azadi-arch" d="M548 540 L548 452 Q600 368 652 452 L652 540Z" />
      <path className="t-azadi-arch" d="M586 384 Q600 352 614 384 L614 404 L586 404Z" />
      <path className="t-azadi-line" d="M520 500 L548 470 M680 500 L652 470 M566 330 L600 300 L634 330" fill="none" strokeWidth={2} />
    </g>
  );
}

function Milad() {
  // Milad Tower: tapered shaft, the faceted head and the antenna mast.
  return (
    <g className="t-landmark t-milad">
      <path className="t-milad-body" d="M984 540 L996 498 L1000 214 L1010 214 L1014 498 L1026 540Z" />
      <path className="t-milad-head" d="M966 220 L978 204 L1032 204 L1044 220 L1032 232 L978 232Z" />
      <path className="t-milad-head" d="M984 204 L990 186 L1020 186 L1026 204Z" />
      <rect className="t-milad-body" x={1003} y={84} width={4} height={102} />
      <rect className="t-milad-body" x={1004.2} y={52} width={1.6} height={34} />
      {[982, 996, 1010, 1024].map((x) => <circle key={x} className="t-milad-light" cx={x} cy={218} r={2.4} />)}
    </g>
  );
}

function Tree({ x, s = 1, y = 540 }: { x: number; s?: number; y?: number }) {
  return (
    <g className="t-tree-g" transform={`translate(${x} ${y}) scale(${s})`}>
      <rect className="t-trunk" x={-3} y={-30} width={6} height={30} />
      <circle className="t-tree" cx={0} cy={-44} r={20} />
      <circle className="t-tree" cx={-12} cy={-34} r={13} />
      <circle className="t-tree" cx={12} cy={-34} r={13} />
    </g>
  );
}

export function TehranScene({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox={`0 0 ${WORLD.width} ${WORLD.height}`} preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="t-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="t-sky-top" />
          <stop offset="1" className="t-sky-bottom" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={1600} height={680} fill="url(#t-sky)" />
      <circle className="t-orb" cx={1430} cy={118} r={44} />
      <g className="t-stars">
        {[[180, 70], [340, 130], [520, 60], [760, 110], [880, 50], [1120, 90], [1260, 40], [1530, 70], [640, 150], [60, 140]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={1.4} />
        ))}
      </g>
      <path className="t-ridge-back" d={RIDGE_BACK} />
      {PEAKS.map(([x, y]) => <path key={x} className="t-snow" d={`M${x - 24} ${y + 19} L${x} ${y} L${x + 24} ${y + 19} L${x + 9} ${y + 14} L${x} ${y + 21} L${x - 10} ${y + 13}Z`} />)}
      <path className="t-ridge-front" d={RIDGE_FRONT} />
      <g className="t-farcity">{FAR_CITY.map((b) => <rect key={b.x} x={b.x} y={540 - b.h} width={b.w} height={b.h} />)}</g>
      <Milad />
      <Azadi />
      <rect className="t-plaza" x={440} y={528} width={320} height={12} rx={3} />
      {[262, 455, 745, 962, 1050, 1285, 1452].map((x, i) => <Tree key={x} x={x} s={i % 2 ? 0.85 : 1} />)}
      {(Object.keys(BUILDINGS) as DestinationKey[]).filter((k) => k !== "memories").map((key, i) => {
        const b = BUILDINGS[key];
        return (
          <g key={key} className={`t-bld t-bld-${key}`} style={{ ["--i" as string]: i }}>
            <g transform={`translate(${b.x} ${WORLD.ground})`}>
              <BuildingArt kind={key} />
            </g>
          </g>
        );
      })}
      <rect className="t-curb" x={0} y={540} width={1600} height={10} />
      <rect className="t-lawn" x={0} y={550} width={1600} height={130} />
      <path className="t-path" d="M0 640 C220 612 420 668 640 640 S1080 610 1300 642 S1520 660 1600 646 L1600 664 C1500 676 1400 664 1300 660 S860 630 640 660 S220 632 0 660Z" />
      {[[120, 600], [470, 604], [1150, 600], [1390, 606]].map(([x, y]) => <Bench key={x} x={x!} y={y!} />)}
      <Cat x={146} y={582} tone="a" />
      <Cat x={176} y={582} tone="c" flip />
      <Cat x={500} y={586} tone="b" />
      <Cat x={1420} y={588} tone="c" flip />
      <Dog x={1230} y={618} />
      <Dog x={330} y={622} />
      {[60, 700, 1000, 1540].map((x, i) => <Tree key={`p${x}`} x={x} s={i % 2 ? 0.7 : 0.8} y={600} />)}
      <g className="t-bld t-bld-memories" style={{ ["--i" as string]: 6 }}>
        <g transform={`translate(${BUILDINGS.memories.x} ${BUILDINGS.memories.base})`}>
          <BuildingArt kind="memories" />
        </g>
      </g>
    </svg>
  );
}

/** One building on its own, for the mobile destination tiles. */
export function BuildingTile({ kind }: { kind: DestinationKey }) {
  const b = BUILDINGS[kind];
  const pad = 30;
  return (
    <svg className="tehran-tile__art" viewBox={`${-pad} ${-b.h - 30} ${b.w + pad * 2} ${b.h + 38}`} aria-hidden="true" focusable="false">
      <rect className="t-curb" x={-pad} y={0} width={b.w + pad * 2} height={8} />
      <BuildingArt kind={kind} />
    </svg>
  );
}
