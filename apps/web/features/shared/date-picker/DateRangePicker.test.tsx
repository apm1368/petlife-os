import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { renderWithIntl } from "@/test/render-with-intl";
import { DateRangePicker, DateRangeField, formatStayRange, type DateRangeValue } from "./DateRangePicker";

function Harness({ initial, onValue, ...rest }: { initial?: DateRangeValue; onValue?: (v: DateRangeValue) => void } & Partial<React.ComponentProps<typeof DateRangePicker>>) {
  const [value, setValue] = useState<DateRangeValue>(initial ?? { start: null, end: null });
  return <DateRangePicker months={1} min="2026-09-28" {...rest} value={value} onChange={(v) => { setValue(v); onValue?.(v); }} />;
}

describe("DateRangePicker", () => {
  it("renders a Jalali month with Persian digits and Saturday-first weekdays in Persian", () => {
    renderWithIntl(<Harness />, "fa");
    expect(screen.getByRole("heading", { name: "مهر ۱۴۰۵" })).toBeTruthy();
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers[0]).toBe("ش");
    expect(screen.getByRole("button", { name: /دوشنبه، ۶ مهر ۱۴۰۵/ })).toBeTruthy();
  });

  it("renders Gregorian in English and selects a check-in then check-out as ISO days", () => {
    const onValue = vi.fn();
    renderWithIntl(<Harness onValue={onValue} />, "en");
    expect(screen.getByRole("heading", { name: "September 2026" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Tuesday, 29 September 2026/ }));
    expect(onValue).toHaveBeenLastCalledWith({ start: "2026-09-29", end: null });
    fireEvent.click(screen.getByRole("button", { name: /Wednesday, 30 September 2026/ }));
    expect(onValue).toHaveBeenLastCalledWith({ start: "2026-09-29", end: "2026-09-30" });
  });

  it("refuses past days, stays across an unavailable night, and too-short stays — with the reason in the label", () => {
    const onValue = vi.fn();
    renderWithIntl(<Harness onValue={onValue} months={2} minNights={2} isUnavailable={(iso) => iso === "2026-10-02"} initial={{ start: "2026-09-29", end: null }} />, "en");
    const past = screen.getByRole("button", { name: /27 September 2026.*Past/ });
    fireEvent.click(past);
    expect(onValue).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /30 September 2026.*Minimum 2 nights/ }).getAttribute("aria-disabled")).toBe("true");
    // The blocked night can be the check-out day (that night is not used)...
    fireEvent.click(screen.getByRole("button", { name: /Friday, 2 October 2026/ }));
    expect(onValue).toHaveBeenLastCalledWith({ start: "2026-09-29", end: "2026-10-02" });
  });

  it("moves focus with the keyboard, mirrored in RTL", () => {
    renderWithIntl(<Harness />, "fa");
    const today = screen.getByRole("button", { name: /^دوشنبه، ۶ مهر ۱۴۰۵/ });
    today.focus();
    fireEvent.keyDown(today, { key: "ArrowLeft" });
    fireEvent.keyDown(today, { key: "Enter" });
    expect(screen.getByRole("button", { name: /^سه‌شنبه، ۷ مهر ۱۴۰۵، ورود/ })).toBeTruthy();
  });

  it("lets Persian readers switch to the Gregorian calendar", () => {
    renderWithIntl(<Harness />, "fa");
    fireEvent.click(screen.getByRole("button", { name: "میلادی" }));
    expect(screen.getByRole("heading", { name: "سپتامبر ۲۰۲۶" })).toBeTruthy();
  });

  it("the field shows one month in its narrow sheet and commits only on Apply", () => {
    const onChange = vi.fn();
    renderWithIntl(<DateRangeField label="Dates" min="2026-09-28" months={2} value={{ start: null, end: null }} onChange={onChange} />, "en");
    fireEvent.click(screen.getByRole("button", { name: /Dates/ }));
    fireEvent.click(screen.getByRole("button", { name: /Tuesday, 29 September 2026/ }));
    const apply = screen.getByRole("button", { name: "Apply dates", hidden: true }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.queryByRole("heading", { name: "September 2026" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Thursday, 1 October 2026/ }));
    fireEvent.click(apply);
    expect(onChange).toHaveBeenCalledWith({ start: "2026-09-29", end: "2026-10-01" });
  });

  it("formats a stay summary with the night count", () => {
    expect(formatStayRange({ start: "2026-09-28", end: "2026-09-30" }, "fa")).toBe("۶ مهر — ۸ مهر ۱۴۰۵، ۲ شب");
    expect(formatStayRange({ start: "2026-09-28", end: "2026-09-29" }, "en")).toBe("28 September — 29 September 2026 · 1 night");
  });
});
