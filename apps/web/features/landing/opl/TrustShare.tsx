"use client";

import { useState } from "react";
import { Check, LockKeyhole, ShieldCheck } from "@petlife/ui";
import { useLanding } from "./LandingShell";
import { fillVars, oplCopy, withName } from "./opl-copy";
import { storyCopy } from "../story-copy";
import { Bird } from "./Bird";

type Section = "vaccination" | "allergies" | "medications" | "conditions";
const ROWS: { key: Section; value: "recorded3" | "recorded1" | "unknown"; src: "fromClinic" | "fromYou" | "notRecorded" }[] = [
  { key: "vaccination", value: "recorded3", src: "fromClinic" },
  { key: "allergies", value: "unknown", src: "notRecorded" },
  { key: "medications", value: "recorded1", src: "fromYou" },
  { key: "conditions", value: "recorded1", src: "fromClinic" },
];
const HL = ["controls", "source", "unknown"] as const;

/** The trust principles, shown by letting the visitor try the real health-share options (4 sections, up to 7 days). */
export function TrustShare() {
  const { locale, name } = useLanding();
  const s = storyCopy[locale], c = oplCopy[locale].share;
  const [on, setOn] = useState<Record<Section, boolean>>({ vaccination: true, allergies: true, medications: false, conditions: false });
  const [dur, setDur] = useState(0);
  const [hl, setHl] = useState<(typeof HL)[number] | "">("");
  return <section className="opl-sec opl-trust" aria-labelledby="opl-trust-title">
    <div className="opl-wrap opl-trust__grid">
      <div>
        <p className="opl-eyebrow"><ShieldCheck size={18} aria-hidden="true" />{s.trustEyebrow}</p>
        <h2 className="opl-h2" id="opl-trust-title">{s.trustTitle}</h2>
        <ul className="opl-principles">{s.trust.map((point, i) => <li key={point.title} tabIndex={0} className={hl === HL[i] ? "on" : undefined}
          onPointerEnter={() => setHl(HL[i]!)} onPointerLeave={() => setHl("")} onFocus={() => setHl(HL[i]!)} onBlur={() => setHl("")}>
          <h3>{point.title}</h3><p>{point.body}</p>
        </li>)}</ul>
      </div>
      <div className={`opl-share${hl ? ` hl-${hl}` : ""}`}>
        <Bird kind="cockatiel" style={{ top: -40, insetInlineStart: 52 }} />
        <div className="opl-share__head"><span className="opl-share__title">{withName(c.title, name)}</span><span className="opl-tag">{oplCopy[locale].path.sample}</span></div>
        <div className="opl-share__ctl">
          <div><p className="opl-lbl" id="opl-share-sections">{c.sectionsLabel}</p>
            <div className="opl-toggles" role="group" aria-labelledby="opl-share-sections">{(["vaccination", "allergies", "medications", "conditions"] as Section[]).map((k) =>
              <button key={k} type="button" className="opl-tg" aria-pressed={on[k]} onClick={() => setOn((v) => ({ ...v, [k]: !v[k] }))}><Check size={16} aria-hidden="true" />{c.sections[k]}</button>)}</div></div>
          <div><p className="opl-lbl" id="opl-share-duration">{c.durationLabel}</p>
            <div className="opl-seg" role="radiogroup" aria-labelledby="opl-share-duration">{c.durations.map((d, i) =>
              <button key={d} type="button" role="radio" aria-checked={dur === i} onClick={() => setDur(i)}>{d}</button>)}</div></div>
        </div>
        <div><p className="opl-lbl">{c.previewLabel}</p>
          <div className="opl-prev">{ROWS.map((row) => <div key={row.key} className={`opl-prow${on[row.key] ? "" : " off"}`}>
            <span className="opl-prow__n">{c.sections[row.key]}</span>
            <span className={`opl-prow__v${row.value === "unknown" ? " unknown" : ""}`}>{c[row.value]}</span>
            <span className={`opl-src ${row.src}`}>{c[row.src]}</span>
            <span className="opl-prow__lock" aria-hidden={on[row.key]}><LockKeyhole size={15} aria-hidden="true" />{c.hidden}</span>
          </div>)}</div></div>
        <p className="opl-share__foot">{fillVars(c.foot, { d: c.durations[dur]! })}</p>
      </div>
    </div>
  </section>;
}
