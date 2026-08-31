"use client";

import { useRef } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { cn } from "./cn";

export interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  errorMessage?: string;
  disabled?: boolean;
}

/**
 * Digit-per-box OTP input. Keeps a single string of state (not per-box)
 * so callers never need to reassemble the code, and paste fills every box.
 */
export function OtpInput({ length = 6, value, onChange, errorMessage, disabled }: OtpInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  function setDigit(index: number, digit: string) {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join("").slice(0, length));
    if (digit && index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (pasted) {
      event.preventDefault();
      onChange(pasted);
      refs.current[Math.min(pasted.length, length - 1)]?.focus();
    }
  }

  return (
    <div>
      <div className="flex gap-2" dir="ltr" role="group" aria-label="One-time passcode">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              refs.current[index] = el;
            }}
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={1}
            value={digit}
            disabled={disabled}
            aria-invalid={Boolean(errorMessage) || undefined}
            onChange={(e) => setDigit(index, e.target.value.replace(/\D/g, "").slice(-1))}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            className={cn(
              "h-12 w-10 rounded-md border border-border-strong bg-surface-elevated text-center text-numeric text-text-primary",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
              errorMessage && "border-state-urgent",
            )}
          />
        ))}
      </div>
      {errorMessage ? (
        <p role="alert" className="mt-1.5 text-metadata text-state-urgent">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}