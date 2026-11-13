"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { SetPetZone } from "@petlife/types";
import { GarmentMockups, type GarmentLook, type PrintPreview } from "./GarmentMockups";
import { humanShirtPoints, humanZoneBox, petShirtPoints, petShirtShape } from "./garment-geometry";
import { HUMAN_ZONES, colourHex, sizeLabel } from "./set-pet-catalog";

/** three.js is loaded only when someone opens the 3D view on /set-pet (owner P31: lazy). */
const Garment3D = dynamic(() => import("./Garment3D").then((m) => m.Garment3D), { ssr: false });

type Props = {
  human: GarmentLook;
  pet?: GarmentLook | null;
  prints: Partial<Record<SetPetZone, PrintPreview>>;
  onZoneClick?: (zone: SetPetZone) => void;
  selectedZone?: SetPetZone | null;
};

const NECK: Array<[number, number]> = [[-9, 0], [-5, 3.4], [0, 4.6], [5, 3.4], [9, 0]];

/**
 * The live preview of the set (owner P31–P34): a rotatable 3D view by default, or the flat front/back view with the cm
 * ruler. Human and pet garments sit side by side, stacked on phones. Without WebGL the flat view is used.
 */
export function SetPetPreview({ human, pet, prints, onZoneClick, selectedZone }: Props) {
  const t = useTranslations("setPet.preview");
  const tg = useTranslations("setPet.garments");
  const [mode, setMode] = useState<"3d" | "flat">("3d");
  const [noWebGl, setNoWebGl] = useState(false);
  const [side, setSide] = useState<"front" | "back">("front");
  const view = noWebGl ? "flat" : mode;

  const human3d = useMemo(() => ({
    outline: [...NECK, ...humanShirtPoints(human.size, human.garment)],
    front: { zones: HUMAN_ZONES.filter((z) => z !== "BACK").map((zone) => ({ zone, box: humanZoneBox(zone, human.size, human.garment)! })) },
    back: { zones: [{ zone: "BACK" as const, box: humanZoneBox("BACK", human.size, human.garment)! }] },
  }), [human.size, human.garment]);
  const pet3d = useMemo(() => (pet ? { outline: petShirtPoints(pet.size, pet.garment), front: { zones: [{ zone: "PET_BACK" as const, box: petShirtShape(pet.size, pet.garment).zone }] }, back: { zones: [] } } : null), [pet]);
  const humanPrints = useMemo(() => Object.fromEntries(Object.entries(prints).filter(([zone]) => zone !== "PET_BACK")) as Partial<Record<SetPetZone, PrintPreview>>, [prints]);
  const petPrints = useMemo(() => (prints.PET_BACK ? { PET_BACK: prints.PET_BACK } : {}) as Partial<Record<SetPetZone, PrintPreview>>, [prints]);

  return (
    <div className="setpet-previewbox">
      <div className="setpet-modes" role="group" aria-label={t("modeLabel")}>
        {noWebGl ? null : (
          <button type="button" aria-pressed={view === "3d"} onClick={() => setMode("3d")}>{t("mode3d")}</button>
        )}
        <button type="button" aria-pressed={view === "flat"} onClick={() => setMode("flat")}>{t("modeFlat")}</button>
      </div>
      {view === "3d" ? (
        <div className="setpet-preview">
          <figure className="setpet-garment">
            <figcaption className="setpet-garment__size">{t("human", { garment: tg(human.garment), size: sizeLabel(human.size) })}</figcaption>
            <Garment3D outline={human3d.outline} depthCm={4} colour={colourHex(human.colour)} front={human3d.front} back={human3d.back} prints={humanPrints} label={t("label3dHuman", { garment: tg(human.garment) })} onUnsupported={() => setNoWebGl(true)} />
          </figure>
          {pet && pet3d ? (
            <figure className="setpet-garment">
              <figcaption className="setpet-garment__size">{t("pet", { garment: tg(pet.garment), size: sizeLabel(pet.size) })}</figcaption>
              <Garment3D outline={pet3d.outline} depthCm={pet.garment === "PET_BANDANA" ? 0.6 : 3} colour={colourHex(pet.colour)} front={pet3d.front} back={pet3d.back} prints={petPrints} label={t("label3dPet", { garment: tg(pet.garment) })} onUnsupported={() => setNoWebGl(true)} />
            </figure>
          ) : null}
        </div>
      ) : (
        <GarmentMockups human={human} pet={pet} side={side} onSideChange={setSide} prints={prints} onZoneClick={onZoneClick} selectedZone={selectedZone} showEmptyZones={!!onZoneClick} />
      )}
      <p className="setpet-previewbox__note">{t("approxNote")}</p>
    </div>
  );
}
