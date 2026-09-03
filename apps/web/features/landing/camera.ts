export const stopIds = [
  "overview",
  "cookie",
  "health",
  "vet",
  "care",
  "shop",
  "grooming",
  "taxi",
  "travel",
  "support",
  "memories",
  "overviewReturn",
] as const;
export type StopId = (typeof stopIds)[number];
export type CameraStop = { id: StopId; progress: number; x: number; y: number; scale: number };
// Coordinates describe the physical artwork, so they never reverse with locale.
const positions = [
  [50, 50, 1],
  [32, 89, 1.65],
  [35, 81, 1.45],
  [22, 45, 1.7],
  [36, 56, 1.55],
  [77, 44, 1.7],
  [65, 43, 1.6],
  [87, 66, 1.6],
  [70, 35, 1.5],
  [35, 39, 1.6],
  [32, 89, 1.65],
  [50, 50, 1],
];
export const cameraStops: CameraStop[] = stopIds.map((id, index) => ({
  id,
  progress: index / (stopIds.length - 1),
  x: positions[index]![0]!,
  y: positions[index]![1]!,
  scale: positions[index]![2]!,
}));
export const clampProgress = (value: number) => Math.max(0, Math.min(1, value));
export function cameraAt(progress: number, mobile = false) {
  const scaled = clampProgress(progress) * (cameraStops.length - 1);
  const index = Math.min(cameraStops.length - 2, Math.floor(scaled));
  const frame = (stop: CameraStop) =>
    mobile && (stop.id === "overview" || stop.id === "overviewReturn") ? { ...stop, x: 32, y: 89 } : stop;
  const from = frame(cameraStops[index]!),
    to = frame(cameraStops[index + 1]!),
    t = scaled - index;
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    scale: from.scale + (to.scale - from.scale) * t,
  };
}
export const nearestStop = (progress: number) =>
  Math.round(clampProgress(progress) * (cameraStops.length - 1));
export function wheelProgress(delta: number, mode: number) {
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? 240 : 1);
  return Math.max(-100, Math.min(100, pixels)) * 0.0006;
}
