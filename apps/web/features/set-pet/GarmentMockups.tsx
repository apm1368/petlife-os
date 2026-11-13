"use client";

import { useLocale, useTranslations } from "next-intl";
import type { SetPetSize, SetPetZone } from "@petlife/types";
import { FileText, Plus, RotateCcw } from "@petlife/ui";
import type { RouteLocale } from "@/lib/i18n/config";
import { formatLocaleNumber } from "@/lib/i18n/format";
import { HUMAN_FRAME, PET_FRAME, boxStyle, humanCollarPath, humanShirtPath, humanZoneBox, petShirtShape, type Box } from "./garment-geometry";
import { HUMAN_ZONES, ZONE_CM, colourHex, isDarkColour, sizeLabel, zoneSide } from "./set-pet-catalog";

export type PreviewDesign = { id: string; name: string; previewUrl: string | null };

type Props = {
  humanSize: SetPetSize;
  petSize: SetPetSize;
  colour: string;
  side: "front" | "back";
  onSideChange: (side: "front" | "back") => void;
  zones: ReadonlySet<SetPetZone>;
  placements: Partial<Record<SetPetZone, string>>;
  designs: ReadonlyMap<string, PreviewDesign>;
  /** When set, the zones on the mockups are buttons that switch a zone on or off. */
  onToggleZone?: (zone: SetPetZone) => void;
};

/**
 * The human T-shirt and the pet shirt side by side, in the chosen colour and sizes, with each chosen design drawn on
 * its zone at true scale (owner, 2026-11-13). Only raster previews are ever shown, and only as <img>; print files show
 * a "file received" tile. Turning the shirt = switching between the front and back views.
 */
export function GarmentMockups({ humanSize, petSize, colour, side, onSideChange, zones, placements, designs, onToggleZone }: Props) {
  const t = useTranslations("setPet.preview");
  const tz = useTranslations("setPet.zones");
  const locale = useLocale() as RouteLocale;
  const fill = colourHex(colour);
  const dark = isDarkColour(colour);
  const pet = petShirtShape(petSize);
  const humanZones = HUMAN_ZONES.filter((zone) => zoneSide(zone) === side);

  const zoneTile = (zone: SetPetZone, box: Box, frame: typeof HUMAN_FRAME) => {
    const on = zones.has(zone);
    if (!on && !onToggleZone) return null;
    const design = on ? designs.get(placements[zone] ?? "") : undefined;
    const cm = ZONE_CM[zone] ? formatLocaleNumber(ZONE_CM[zone]!, locale) : null;
    const name = tz(`${zone}.name`);
    const label = cm ? t("zoneLabel", { zone: name, cm }) : name;
    const body = design ? (
      design.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local blob or short-lived same-origin URL of a raster file
        <img src={design.previewUrl} alt={t("designOn", { name: design.name, zone: name })} draggable={false} />
      ) : (
        <span className="setpet-zone__file"><FileText size={16} aria-hidden="true" /><small>{t("fileReceived")}</small></span>
      )
    ) : on ? (
      <span className="setpet-zone__empty">{cm ? `${cm}×${cm}` : null}</span>
    ) : (
      <Plus size={14} aria-hidden="true" />
    );
    const className = `setpet-zone${on ? " is-on" : ""}${design ? " has-design" : ""}`;
    return onToggleZone ? (
      <button key={zone} type="button" className={className} style={boxStyle(box, frame)} aria-pressed={on} aria-label={label} title={label} onClick={() => onToggleZone(zone)}>
        {body}
      </button>
    ) : (
      <span key={zone} className={className} style={boxStyle(box, frame)} title={label}>{body}</span>
    );
  };

  return (
    <div className={`setpet-preview${dark ? " is-dark" : ""}`}>
      <figure className="setpet-garment">
        <div className="setpet-garment__bar">
          <span className="setpet-garment__size">{t("human", { size: sizeLabel(humanSize) })}</span>
          <button type="button" className="setpet-turn" aria-pressed={side === "back"} onClick={() => onSideChange(side === "front" ? "back" : "front")}>
            <RotateCcw size={16} aria-hidden="true" />
            {side === "front" ? t("showBack") : t("showFront")}
          </button>
        </div>
        <div className="setpet-garment__frame" style={{ aspectRatio: `${HUMAN_FRAME.width} / ${HUMAN_FRAME.height}` }} dir="ltr">
          <svg viewBox={`${HUMAN_FRAME.minX} ${HUMAN_FRAME.minY} ${HUMAN_FRAME.width} ${HUMAN_FRAME.height}`} aria-hidden="true" focusable="false">
            <path className="setpet-garment__body" d={humanShirtPath(humanSize, side)} fill={fill} />
            <path className="setpet-garment__collar" d={humanCollarPath(side)} fill="none" />
          </svg>
          {humanZones.map((zone) => {
            const box = humanZoneBox(zone, humanSize);
            return box ? zoneTile(zone, box, HUMAN_FRAME) : null;
          })}
        </div>
        <figcaption>{side === "front" ? t("frontCaption") : t("backCaption")}</figcaption>
      </figure>

      <figure className="setpet-garment">
        <div className="setpet-garment__bar">
          <span className="setpet-garment__size">{t("pet", { size: sizeLabel(petSize) })}</span>
        </div>
        <div className="setpet-garment__frame" style={{ aspectRatio: `${PET_FRAME.width} / ${PET_FRAME.height}` }} dir="ltr">
          <svg viewBox={`${PET_FRAME.minX} ${PET_FRAME.minY} ${PET_FRAME.width} ${PET_FRAME.height}`} aria-hidden="true" focusable="false">
            <path className="setpet-garment__body" d={pet.path} fill={fill} />
            <path className="setpet-garment__collar" d={pet.collar} fill="none" />
          </svg>
          {zoneTile("PET_BACK", pet.zone, PET_FRAME)}
        </div>
        <figcaption>{t("petCaption")}</figcaption>
      </figure>
    </div>
  );
}
