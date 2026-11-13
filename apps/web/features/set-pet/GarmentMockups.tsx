"use client";

import type { CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SetPetFont, SetPetGarment, SetPetSize, SetPetZone } from "@petlife/types";
import { FileText, Plus, RotateCcw } from "@petlife/ui";
import type { RouteLocale } from "@/lib/i18n/config";
import { formatLocaleNumber } from "@/lib/i18n/format";
import {
  boxStyle, humanCollarPath, humanExtrasPath, humanFrame, humanRuler, humanShirtPath, humanZoneBox, petFrame, petRuler, petShirtShape, rulerTicks,
  type Box, type Frame,
} from "./garment-geometry";
import { HUMAN_ZONES, ZONE_CM, colourHex, isDarkColour, sizeLabel, zoneSide } from "./set-pet-catalog";

/** What is printed on a zone, as the preview draws it: a raster preview (or a "file received" tile), or a line of text. */
export type PrintPreview =
  | { kind: "image"; name: string; url: string | null; scale: number; offsetX: number; offsetY: number }
  | { kind: "text"; text: string; font: SetPetFont; colour: string };

export type GarmentLook = { garment: SetPetGarment; size: SetPetSize; colour: string };

type Props = {
  human: GarmentLook;
  /** Omitted for a human-only set (owner P8: in memory of a pet). */
  pet?: GarmentLook | null;
  side: "front" | "back";
  onSideChange: (side: "front" | "back") => void;
  prints: Partial<Record<SetPetZone, PrintPreview>>;
  /** When set, the zones on the mockups are buttons (choose a zone to edit, or switch it on). */
  onZoneClick?: (zone: SetPetZone) => void;
  selectedZone?: SetPetZone | null;
  /** Show empty zones as "+" targets. */
  showEmptyZones?: boolean;
};

export const FONT_FAMILY: Record<SetPetFont, string> = {
  VAZIRMATN: "var(--font-vazirmatn), Vazirmatn, Tahoma, sans-serif",
  LALEZAR: "'SetPet Lalezar', var(--font-vazirmatn), sans-serif",
  AMIRI: "'SetPet Amiri', serif",
};

/** A printed design inside its zone: zoomed and moved (owner P27), clipped by the print area like the real print. */
export function PrintTile({ print, label }: { print: PrintPreview; label: string }) {
  if (print.kind === "text") {
    const size = Math.max(14, Math.min(46, 180 / Math.max(print.text.length, 1)));
    return (
      <svg className="setpet-zone__text" viewBox="0 0 100 100" role="img" aria-label={label}>
        <text x="50" y="50" dominantBaseline="central" textAnchor="middle" fontSize={size} fill={colourHex(print.colour)} style={{ fontFamily: FONT_FAMILY[print.font] }}>
          {print.text}
        </text>
      </svg>
    );
  }
  if (!print.url) return <span className="setpet-zone__file"><FileText size={16} aria-hidden="true" /><small>{print.name}</small></span>;
  const travel = (print.scale - 1) * 50;
  const style: CSSProperties = { transform: `translate(${print.offsetX * travel}%, ${print.offsetY * travel}%) scale(${print.scale})` };
  // eslint-disable-next-line @next/next/no-img-element -- a local blob or short-lived same-origin URL of a raster file
  return <img src={print.url} alt={label} draggable={false} style={style} />;
}

/** The cm ruler under each garment, so sizes and print areas read in real centimetres (owner P34). */
function Ruler({ y, fromX, lengthCm, unit, format }: { y: number; fromX: number; lengthCm: number; unit: string; format: (n: number) => string }) {
  return (
    <g className="setpet-ruler">
      <line x1={fromX} x2={fromX + lengthCm} y1={y} y2={y} />
      {rulerTicks(fromX, lengthCm).map((tick) => (
        <g key={tick.x}>
          <line x1={tick.x} x2={tick.x} y1={y} y2={y + tick.size} />
          {tick.label != null ? <text x={tick.x} y={y + 6.6}>{format(tick.label)}</text> : null}
        </g>
      ))}
      <text className="setpet-ruler__unit" x={fromX} y={y - 1.6}>{unit}</text>
    </g>
  );
}

/**
 * The flat 2D view: the human garment and the pet garment, stacked on phones (owner P32), in their colours and sizes,
 * with every print drawn on its zone at true scale and a cm ruler (P34). Only raster previews are ever shown, and
 * only as <img>; print files show a "file received" tile. Turning the garment = switching between front and back.
 */
export function GarmentMockups({ human, pet, side, onSideChange, prints, onZoneClick, selectedZone, showEmptyZones }: Props) {
  const t = useTranslations("setPet.preview");
  const tz = useTranslations("setPet.zones");
  const tg = useTranslations("setPet.garments");
  const locale = useLocale() as RouteLocale;
  const format = (n: number) => formatLocaleNumber(n, locale);
  const humanZones = HUMAN_ZONES.filter((zone) => zoneSide(zone) === side);
  const hFrame = humanFrame(human.size);
  const petShape = pet ? petShirtShape(pet.size, pet.garment) : null;
  const pFrame = pet ? petFrame(pet.size, pet.garment) : null;
  const extras = humanExtrasPath(human.size, side, human.garment);

  const zoneTile = (zone: SetPetZone, box: Box, frame: Frame) => {
    const print = prints[zone];
    if (!print && !showEmptyZones && !onZoneClick) return null;
    const cm = ZONE_CM[zone] ? format(ZONE_CM[zone]!) : null;
    const name = tz(`${zone}.name`);
    const label = cm ? t("zoneLabel", { zone: name, cm }) : name;
    const body = print ? <PrintTile print={print} label={t("designOn", { name: print.kind === "text" ? print.text : print.name, zone: name })} /> : <span className="setpet-zone__empty">{cm ? `${cm}×${cm}` : <Plus size={14} aria-hidden="true" />}</span>;
    const className = `setpet-zone${print ? " is-on has-design" : ""}${selectedZone === zone ? " is-selected" : ""}`;
    return onZoneClick ? (
      <button key={zone} type="button" className={className} style={boxStyle(box, frame)} aria-pressed={selectedZone === zone} aria-label={label} title={label} onClick={() => onZoneClick(zone)}>
        {body}
      </button>
    ) : (
      <span key={zone} className={className} style={boxStyle(box, frame)} title={label}>{body}</span>
    );
  };

  return (
    <div className="setpet-preview">
      <figure className={`setpet-garment${isDarkColour(human.colour) ? " is-dark" : ""}`}>
        <div className="setpet-garment__bar">
          <span className="setpet-garment__size">{t("human", { garment: tg(human.garment), size: sizeLabel(human.size) })}</span>
          <button type="button" className="setpet-turn" aria-pressed={side === "back"} onClick={() => onSideChange(side === "front" ? "back" : "front")}>
            <RotateCcw size={16} aria-hidden="true" />
            {side === "front" ? t("showBack") : t("showFront")}
          </button>
        </div>
        <div className="setpet-garment__frame" style={{ aspectRatio: `${hFrame.width} / ${hFrame.height}` }} dir="ltr">
          <svg viewBox={`${hFrame.minX} ${hFrame.minY} ${hFrame.width} ${hFrame.height}`} aria-hidden="true" focusable="false">
            <path className="setpet-garment__body" d={humanShirtPath(human.size, side, human.garment)} fill={colourHex(human.colour)} />
            {extras ? <path className="setpet-garment__collar" d={extras} fill="none" /> : null}
            <path className="setpet-garment__collar" d={humanCollarPath(side)} fill="none" />
            <Ruler {...humanRuler(human.size)} unit={t("cm")} format={format} />
          </svg>
          {humanZones.map((zone) => {
            const box = humanZoneBox(zone, human.size, human.garment);
            return box ? zoneTile(zone, box, hFrame) : null;
          })}
        </div>
        <figcaption>{side === "front" ? t("frontCaption") : t("backCaption")}</figcaption>
      </figure>

      {pet && petShape && pFrame ? (
        <figure className={`setpet-garment${isDarkColour(pet.colour) ? " is-dark" : ""}`}>
          <div className="setpet-garment__bar">
            <span className="setpet-garment__size">{t("pet", { garment: tg(pet.garment), size: sizeLabel(pet.size) })}</span>
          </div>
          <div className="setpet-garment__frame" style={{ aspectRatio: `${pFrame.width} / ${pFrame.height}` }} dir="ltr">
            <svg viewBox={`${pFrame.minX} ${pFrame.minY} ${pFrame.width} ${pFrame.height}`} aria-hidden="true" focusable="false">
              <path className="setpet-garment__body" d={petShape.path} fill={colourHex(pet.colour)} />
              {petShape.hood ? <path className="setpet-garment__collar" d={petShape.hood} fill="none" /> : null}
              <path className="setpet-garment__collar" d={petShape.collar} fill="none" />
              <Ruler {...petRuler(pet.size, pet.garment)} unit={t("cm")} format={format} />
            </svg>
            {zoneTile("PET_BACK", petShape.zone, pFrame)}
          </div>
          <figcaption>{t("petCaption")}</figcaption>
        </figure>
      ) : null}
    </div>
  );
}
