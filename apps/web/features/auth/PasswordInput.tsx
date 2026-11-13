"use client";
import { useState } from "react";
import { useLocale } from "next-intl";
import { Input, type InputProps } from "@petlife/ui";
import type { RouteLocale } from "@/lib/i18n/config";

const VISIBILITY_COPY: Record<RouteLocale, { show: string; hide: string }> = {
 fa: { show: "نمایش", hide: "پنهان" },
 en: { show: "Show", hide: "Hide" },
 de: { show: "Anzeigen", hide: "Ausblenden" },
 es: { show: "Mostrar", hide: "Ocultar" },
 ar: { show: "إظهار", hide: "إخفاء" },
 nl: { show: "Tonen", hide: "Verbergen" },
};

export function PasswordInput(props: InputProps) {
 const [visible, setVisible] = useState(false);
 const copy = VISIBILITY_COPY[useLocale() as RouteLocale];
 return <div className="auth-password-field"><Input {...props} type={visible ? "text" : "password"} /><button className="auth-password-toggle" type="button" aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? copy.hide : copy.show}</button></div>;
}
