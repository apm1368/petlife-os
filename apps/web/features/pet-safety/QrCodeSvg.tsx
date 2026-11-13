import { encodeQr, qrPath } from "@/lib/qr/qr-code";

/** The QR as SVG markup: dark modules on a white square (scanners need that contrast in dark mode too). */
export function qrSvgMarkup(text: string): string {
  const matrix = encodeQr(text);
  const n = matrix.size + 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#ffffff"/><path d="${qrPath(matrix)}" fill="#1E241F"/></svg>`;
}

export function QrCodeSvg({ text, label, size = 220 }: { text: string; label: string; size?: number }) {
  const matrix = encodeQr(text);
  const n = matrix.size + 8;
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} role="img" aria-label={label} shapeRendering="crispEdges" className="pet-card-qr">
      <rect width={n} height={n} fill="#ffffff" />
      <path d={qrPath(matrix)} fill="#1E241F" />
    </svg>
  );
}
