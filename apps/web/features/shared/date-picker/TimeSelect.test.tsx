import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { TimeSelect } from "./TimeSelect";

describe("TimeSelect locale labels", () => {
  it.each([["fa", "نامشخص"], ["en", "Not sure"], ["de", "Nicht sicher"], ["es", "No estoy seguro"]] as const)("uses the selected language for its empty time option (%s)", (locale, label) => {
    renderWithIntl(<TimeSelect label="Time" value="" onChange={() => undefined} />, locale);
    expect(screen.getByRole("combobox").textContent).toContain(label);
    if (locale === "de" || locale === "es") expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });
});
