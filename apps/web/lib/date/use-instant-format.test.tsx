import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { useInstantFormat } from "./use-instant-format";

function Probe() {
  const fmt = useInstantFormat();
  return <p data-testid="out">{`${fmt.date("2026-10-04T08:00:00Z")} | ${fmt.dateTime("2026-10-04T08:00:00Z")} | ${fmt.number(1250000)}`}</p>;
}

describe("useInstantFormat", () => {
  it("Persian pages get Jalali dates and Persian digits, never the browser default", () => {
    renderWithIntl(<Probe />, "fa");
    const text = screen.getByTestId("out").textContent!;
    expect(text).toContain("مهر");
    expect(text).toContain("۱۴۰۵");
    expect(text).not.toMatch(/[0-9]/);
  });

  it("English pages get Gregorian dates", () => {
    renderWithIntl(<Probe />, "en");
    const text = screen.getByTestId("out").textContent!;
    expect(text).toContain("October 4, 2026");
    expect(text).toContain("1,250,000");
  });
});
