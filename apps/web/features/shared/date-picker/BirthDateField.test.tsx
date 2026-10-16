import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { BirthDateField } from "./BirthDateField";
function Field({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <><BirthDateField label="تولد" value={value} onChange={setValue} /><output data-testid="iso">{value}</output></>;
}
describe("BirthDateField calendars", () => {
  it("defaults to Jalali in Persian and preserves the actual date across calendar switches", () => {
    renderWithIntl(<Field initial="2024-03-20" />, "fa");
    expect((screen.getByLabelText("سال") as HTMLSelectElement).value).toBe("1403");
    fireEvent.change(screen.getByLabelText("نوع تقویم"), { target: { value: "gregorian" } });
    expect((screen.getByLabelText("سال") as HTMLSelectElement).value).toBe("2024");
    expect(screen.getByTestId("iso").textContent).toBe("2024-03-20");
    fireEvent.change(screen.getByLabelText("نوع تقویم"), { target: { value: "jalali" } });
    expect((screen.getByLabelText("ماه") as HTMLSelectElement).value).toBe("1");
    expect(screen.getByTestId("iso").textContent).toBe("2024-03-20");
  });
  it("converts a Persian-calendar selection into the ISO API date", () => {
    renderWithIntl(<Field />, "fa");
    fireEvent.change(screen.getByLabelText("سال"), { target: { value: "1403" } });
    fireEvent.change(screen.getByLabelText("ماه"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("روز"), { target: { value: "1" } });
    expect(screen.getByTestId("iso").textContent).toBe("2024-03-20");
  });
  it("clamps the displayed day when changing from a long month to February", () => {
    renderWithIntl(<Field initial="2024-01-31" />, "en");
    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "2" } });
    expect((screen.getByLabelText("Day") as HTMLSelectElement).value).toBe("29");
    expect(screen.getByTestId("iso").textContent).toBe("2024-02-29");
  });
});
