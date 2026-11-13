import type { SetPetZone } from "@petlife/types";
import type { Box } from "./garment-geometry";
import type { PrintPreview } from "./GarmentMockups";
import { colourHex } from "./set-pet-catalog";

/** Font stacks the canvas can use (the @font-face rules live in set-pet.css). */
const CANVAS_FONT = { VAZIRMATN: "Vazirmatn, Tahoma, sans-serif", LALEZAR: "'SetPet Lalezar', Tahoma, sans-serif", AMIRI: "'SetPet Amiri', serif" } as const;

/** Loads raster previews once (blob: or same-origin URLs only; nothing else is ever drawn). */
const images = new Map<string, Promise<HTMLImageElement | null>>();
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  const safe = url.startsWith("blob:") || url.startsWith("/") || (typeof window !== "undefined" && url.startsWith(window.location.origin));
  if (!safe) return Promise.resolve(null);
  let pending = images.get(url);
  if (!pending) {
    pending = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    images.set(url, pending);
  }
  return pending;
}

/**
 * Draws the prints of one garment face onto a transparent canvas laid over the garment's outline (in cm, y downwards
 * from the shoulder line): each print inside its zone box, clipped like the real print, an image contained then
 * zoomed and moved (owner P27), text in its font and colour.
 */
export async function drawPrints(
  canvas: HTMLCanvasElement,
  bounds: { minX: number; minY: number; width: number; height: number },
  zones: Array<{ zone: SetPetZone; box: Box }>,
  prints: Partial<Record<SetPetZone, PrintPreview>>,
): Promise<void> {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const scale = canvas.width / bounds.width;
  const loaded = new Map<SetPetZone, HTMLImageElement | null>();
  await Promise.all(zones.map(async ({ zone }) => {
    const print = prints[zone];
    if (print?.kind === "image" && print.url) loaded.set(zone, await loadImage(print.url));
    if (print?.kind === "text" && typeof document !== "undefined" && document.fonts?.load) await document.fonts.load(`40px ${CANVAS_FONT[print.font]}`).catch(() => undefined);
  }));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const { zone, box } of zones) {
    const print = prints[zone];
    if (!print) continue;
    ctx.save();
    ctx.translate((box.cx - bounds.minX) * scale, (box.cy - bounds.minY) * scale);
    ctx.rotate((box.rotate * Math.PI) / 180);
    const w = box.w * scale;
    const h = box.h * scale;
    ctx.beginPath();
    ctx.rect(-w / 2, -h / 2, w, h);
    ctx.clip();
    if (print.kind === "text") {
      const size = Math.max(14, Math.min(46, 180 / Math.max(print.text.length, 1))) / 100 * h;
      ctx.fillStyle = colourHex(print.colour);
      ctx.font = `${Math.round(size)}px ${CANVAS_FONT[print.font]}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.direction = /[؀-ۿ]/.test(print.text) ? "rtl" : "ltr";
      ctx.fillText(print.text, 0, 0, w * 0.96);
    } else {
      const img = loaded.get(zone);
      if (img) {
        const fit = Math.min(w / img.naturalWidth, h / img.naturalHeight) * print.scale;
        const dw = img.naturalWidth * fit;
        const dh = img.naturalHeight * fit;
        const travel = (print.scale - 1) / 2;
        ctx.drawImage(img, -dw / 2 + print.offsetX * travel * w, -dh / 2 + print.offsetY * travel * h, dw, dh);
      } else {
        // A print file (SVG/PDF/AI/PSD/HEIC) is never drawn: a soft tile marks the zone.
        ctx.fillStyle = "rgba(127,127,127,.28)";
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
    }
    ctx.restore();
  }
}
