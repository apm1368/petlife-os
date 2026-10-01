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
export const WORLD = { width: 1600, height: 600, ground: 540 } as const;

export const BUILDINGS: Record<DestinationKey, { x: number; w: number; h: number; door: number }> = {
  health: { x: 60, w: 190, h: 210, door: 70 },
  services: { x: 275, w: 165, h: 180, door: 66 },
  shop: { x: 770, w: 180, h: 170, door: 64 },
  travel: { x: 1060, w: 215, h: 150, door: 70 },
  animalSupport: { x: 1295, w: 150, h: 172, door: 62 },
  community: { x: 1462, w: 128, h: 205, door: 66 },
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
          <rect className="t-facade-ivory" x={0} y={-210} width={190} height={210} />
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
          <rect className="t-facade-sand" x={0} y={-180} width={165} height={180} />
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
          <rect className="t-facade-sage" x={0} y={-170} width={180} height={170} />
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
          <rect className="t-facade-stone" x={0} y={-104} width={215} height={104} />
          <Windows cols={5} rows={1} x0={14} y0={-90} w={30} h={24} gx={40} gy={0} />
          <path className="t-door" d="M86 0 v-46 a21 21 0 0 1 42 0 v46z" />
          <rect className="t-shade" x={180} y={-104} width={35} height={104} />
        </>
      );
    case "animalSupport": // A shelter: pitched roof, round gable window, a low fence.
      return (
        <>
          <path className="t-accent-coral" d="M-6 -110 L75 -172 L156 -110z" />
          <rect className="t-facade-ivory" x={0} y={-112} width={150} height={112} />
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
          <rect className="t-facade-sand" x={0} y={-124} width={128} height={124} />
          {[16, 52, 88].map((x) => <path key={x} className="t-win" d={`M${x} -64 v-28 q12 -18 24 0 v28z`} />)}
          <path className="t-door" d="M46 0 v-40 q18 -26 36 0 v40z" />
          <rect className="t-shade" x={98} y={-124} width={30} height={124} />
        </>
      );
  }
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

function Tree({ x, s = 1 }: { x: number; s?: number }) {
  return (
    <g className="t-tree-g" transform={`translate(${x} 540) scale(${s})`}>
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
      <rect x={0} y={0} width={1600} height={600} fill="url(#t-sky)" />
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
      {(Object.keys(BUILDINGS) as DestinationKey[]).map((key, i) => {
        const b = BUILDINGS[key];
        return (
          <g key={key} className={`t-bld t-bld-${key}`} style={{ ["--i" as string]: i }}>
            <g transform={`translate(${b.x} ${WORLD.ground})`}>
              <BuildingArt kind={key} />
            </g>
          </g>
        );
      })}
      <rect className="t-ground" x={0} y={540} width={1600} height={60} />
      <rect className="t-curb" x={0} y={540} width={1600} height={6} />
      {Array.from({ length: 20 }, (_, i) => <rect key={i} className="t-lane" x={i * 82 + 20} y={572} width={40} height={4} rx={2} />)}
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
