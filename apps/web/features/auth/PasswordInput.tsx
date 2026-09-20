"use client";
import { useState } from "react";
import { useLocale } from "next-intl";
import { Input, type InputProps } from "@petlife/ui";
export function PasswordInput(props: InputProps) {
 const [visible, setVisible] = useState(false);
 const fa = useLocale() === "fa";
 return <div className="auth-password-field"><Input {...props} type={visible ? "text" : "password"} /><button className="auth-password-toggle" type="button" aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? (fa ? "پنهان" : "Hide") : (fa ? "نمایش" : "Show")}</button></div>;
}
