"use client";

import { forwardRef, useCallback, useId, useRef, useState, type InputHTMLAttributes, type ReactNode, type Ref } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Paperclip } from "@petlife/ui";

type FilePickerProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label?: ReactNode };

/**
 * File picker in the UI language. The browser's own control prints "Choose File / No file chosen" in
 * the OS language whatever the page language is; this keeps the native input (form semantics, refs,
 * `.files`, programmatic reset) but shows a labelled button and the chosen names instead.
 */
export const FilePicker = forwardRef(function FilePicker({ label, multiple, onChange, className, id, ...rest }: FilePickerProps, ref: Ref<HTMLInputElement>) {
  const locale = useLocale();
  const t = useTranslations("filePicker");
  const autoId = useId();
  const inputId = id ?? autoId;
  const inner = useRef<HTMLInputElement | null>(null);
  const [, setVersion] = useState(0);
  const setRefs = useCallback(
    (el: HTMLInputElement | null) => {
      inner.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) (ref as { current: HTMLInputElement | null }).current = el;
    },
    [ref],
  );
  // Read from the element on every render so a parent that clears `input.value` after upload is reflected.
  const names = Array.from(inner.current?.files ?? []).map((f) => f.name);
  const choose = multiple ? t("chooseMultiple") : t("choose");
  return (
    <div className={`file-picker ${className ?? ""}`}>
      {label ? <span className="file-picker__label">{label}</span> : null}
      <div className="file-picker__row">
        <input
          ref={setRefs}
          id={inputId}
          type="file"
          multiple={multiple}
          className="sr-only"
          aria-label={typeof label === "string" ? label : choose}
          onChange={(e) => {
            setVersion((v) => v + 1);
            onChange?.(e);
          }}
          {...rest}
        />
        <label htmlFor={inputId} className="btn-quiet file-picker__button">
          <Paperclip size={16} aria-hidden="true" />
          {choose}
        </label>
        <span className="file-picker__names" aria-live="polite">
          {names.length ? new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(names) : t("none")}
        </span>
      </div>
    </div>
  );
});
