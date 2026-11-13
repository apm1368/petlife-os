"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SetPetZone } from "@petlife/types";
import { RotateCcw } from "@petlife/ui";
import type { RouteLocale } from "@/lib/i18n/config";
import { formatLocaleNumber } from "@/lib/i18n/format";
import type { Box } from "./garment-geometry";
import type { PrintPreview } from "./GarmentMockups";
import { drawPrints } from "./print-canvas";

type Face = { zones: Array<{ zone: SetPetZone; box: Box }> };

type Props = {
  /** The garment outline in cm (x across, y down from the shoulder line). */
  outline: Array<[number, number]>;
  depthCm: number;
  colour: string;
  front: Face;
  back: Face;
  prints: Partial<Record<SetPetZone, PrintPreview>>;
  label: string;
  /** Called when WebGL is not available, so the caller shows the flat view instead. */
  onUnsupported: () => void;
};

const TEXTURE_PX_PER_CM = 12;

/**
 * A rotatable 3D garment (owner, #368 P31), drawn with three.js — loaded only here, on demand. The outline is the same
 * centimetre geometry as the flat view, given thickness; the prints are painted on its front and back at true scale,
 * so the cm ruler under it is real (P34). Drag to turn it, or use the front/back button; with reduced motion it never
 * spins by itself. Nothing can be downloaded or shared from it (P33).
 */
export function Garment3D({ outline, depthCm, colour, front, back, prints, label, onUnsupported }: Props) {
  const t = useTranslations("setPet.preview");
  const locale = useLocale() as RouteLocale;
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ setPrints: (p: Partial<Record<SetPetZone, PrintPreview>>) => void; turn: () => void } | null>(null);
  const [pxPerCm, setPxPerCm] = useState(0);
  const [ready, setReady] = useState(false);

  const xs = outline.map(([x]) => x);
  const ys = outline.map(([, y]) => y);
  const bounds = { minX: Math.min(...xs) - 2, minY: Math.min(...ys, 0) - 3, width: Math.max(...xs) - Math.min(...xs) + 4, height: Math.max(...ys) - Math.min(...ys, 0) + 6 };
  const key = JSON.stringify([outline, depthCm, colour]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};
    void (async () => {
      const probe = document.createElement("canvas");
      if (!probe.getContext("webgl2") && !probe.getContext("webgl")) return onUnsupported();
      const THREE = await import("three");
      if (disposed) return;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.domElement.setAttribute("aria-hidden", "true");
      renderer.domElement.className = "setpet-3d__canvas";
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
      camera.position.set(0, 0, 200);
      camera.lookAt(0, 0, 0);
      scene.add(new THREE.AmbientLight(0xffffff, 1.6));
      const key1 = new THREE.DirectionalLight(0xffffff, 1.6);
      key1.position.set(40, 60, 120);
      const key2 = new THREE.DirectionalLight(0xffffff, 0.9);
      key2.position.set(-40, 20, -120);
      scene.add(key1, key2);

      // y is flipped (three's y points up) and the garment is centred on its middle.
      const midY = bounds.minY + bounds.height / 2;
      const shape = new THREE.Shape();
      outline.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, midY - y) : shape.lineTo(x, midY - y)));
      const bevel = Math.min(1.2, depthCm / 3);
      const body = new THREE.ExtrudeGeometry(shape, { depth: depthCm, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: 3, curveSegments: 6 });
      body.translate(0, 0, -depthCm / 2);
      const cloth = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.92, metalness: 0 });
      const group = new THREE.Group();
      group.add(new THREE.Mesh(body, cloth));

      // The prints: one transparent canvas per face, mapped in cm onto the outline (ShapeGeometry UVs are cm).
      const faces = (["front", "back"] as const).map((side) => {
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bounds.width * TEXTURE_PX_PER_CM);
        canvas.height = Math.round(bounds.height * TEXTURE_PX_PER_CM);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        // The back face is turned half a circle with the garment, so seen from behind it reads the right way round.
        texture.repeat.x = 1 / bounds.width;
        texture.repeat.y = 1 / bounds.height;
        texture.offset.x = -bounds.minX / bounds.width;
        texture.offset.y = (bounds.minY + bounds.height - midY) / bounds.height;
        const geometry = new THREE.ShapeGeometry(shape, 6);
        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
        const mesh = new THREE.Mesh(geometry, material);
        const z = depthCm / 2 + bevel + 0.05;
        mesh.position.z = side === "front" ? z : -z;
        if (side === "back") mesh.rotation.y = Math.PI;
        group.add(mesh);
        return { side, canvas, texture, geometry, material };
      });
      scene.add(group);

      let target = 0;
      let raf = 0;
      let spinning = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const size = () => {
        const width = el.clientWidth || 300;
        const height = Math.round(width * (bounds.height / bounds.width));
        renderer.setSize(width, height);
        const half = bounds.width / 2;
        camera.left = -half;
        camera.right = half;
        camera.top = bounds.height / 2;
        camera.bottom = -bounds.height / 2;
        camera.updateProjectionMatrix();
        setPxPerCm(width / bounds.width);
      };
      const frame = () => {
        raf = 0;
        if (spinning) target += 0.006;
        const diff = target - group.rotation.y;
        group.rotation.y += Math.abs(diff) < 0.002 ? diff : diff * 0.15;
        renderer.render(scene, camera);
        if (spinning || Math.abs(target - group.rotation.y) > 0.001) raf = requestAnimationFrame(frame);
      };
      const kick = () => {
        if (!raf) raf = requestAnimationFrame(frame);
      };

      let dragX: number | null = null;
      const down = (e: PointerEvent) => {
        dragX = e.clientX;
        spinning = false;
        renderer.domElement.setPointerCapture?.(e.pointerId);
      };
      const move = (e: PointerEvent) => {
        if (dragX == null) return;
        target += ((e.clientX - dragX) / Math.max(el.clientWidth, 1)) * Math.PI * 1.6;
        dragX = e.clientX;
        kick();
      };
      const up = () => {
        dragX = null;
      };
      renderer.domElement.addEventListener("pointerdown", down);
      renderer.domElement.addEventListener("pointermove", move);
      renderer.domElement.addEventListener("pointerup", up);
      renderer.domElement.addEventListener("pointercancel", up);
      const observer = new ResizeObserver(() => {
        size();
        kick();
      });
      observer.observe(el);
      size();

      api.current = {
        setPrints: (next) => {
          void Promise.all(faces.map(async (face) => {
            await drawPrints(face.canvas, bounds, face.side === "front" ? front.zones : back.zones, next);
            face.texture.needsUpdate = true;
          })).then(kick);
        },
        turn: () => {
          spinning = false;
          const turns = Math.round(target / Math.PI);
          target = (turns + 1) * Math.PI;
          kick();
        },
      };
      api.current.setPrints(prints);
      setReady(true);
      kick();

      cleanup = () => {
        cancelAnimationFrame(raf);
        observer.disconnect();
        renderer.domElement.removeEventListener("pointerdown", down);
        renderer.domElement.removeEventListener("pointermove", move);
        renderer.domElement.removeEventListener("pointerup", up);
        renderer.domElement.removeEventListener("pointercancel", up);
        faces.forEach((f) => {
          f.texture.dispose();
          f.geometry.dispose();
          f.material.dispose();
        });
        body.dispose();
        cloth.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        api.current = null;
      };
    })().catch(() => onUnsupported());
    return () => {
      disposed = true;
      cleanup();
    };
    // The scene is rebuilt only when the garment itself changes; prints are repainted below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    api.current?.setPrints(prints);
  }, [prints]);

  const ruler = pxPerCm ? Math.min(20, Math.floor((host.current?.clientWidth ?? 0) / pxPerCm / 10) * 10 || 10) : 0;
  return (
    <div className="setpet-3d">
      <div className="setpet-3d__stage" ref={host} role="img" aria-label={label} onContextMenu={(e) => e.preventDefault()}>
        {ready ? null : <span className="setpet-3d__loading">{t("loading3d")}</span>}
      </div>
      <div className="setpet-3d__bar">
        <button type="button" className="setpet-turn" onClick={() => api.current?.turn()} disabled={!ready}>
          <RotateCcw size={16} aria-hidden="true" />
          {t("turn")}
        </button>
        {ruler ? (
          <span className="setpet-3d__ruler" dir="ltr" aria-label={t("rulerLabel", { cm: formatLocaleNumber(ruler, locale) })}>
            <span className="setpet-3d__rulerbar" style={{ width: `${ruler * pxPerCm}px` }} />
            <span>{formatLocaleNumber(ruler, locale)} {t("cm")}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
