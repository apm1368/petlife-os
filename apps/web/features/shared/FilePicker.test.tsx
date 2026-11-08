import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { FilePicker } from "./FilePicker";

describe("FilePicker locale copy", () => {
  it.each([
    ["fa", "انتخاب فایل", "فایلی انتخاب نشده"],
    ["en", "Choose a file", "No file chosen"],
    ["de", "Datei auswählen", "Keine Datei ausgewählt"],
    ["es", "Elegir archivo", "No se ha seleccionado ningún archivo"],
  ] as const)("uses the selected language for controls and empty filename in %s", (locale, choose, none) => {
    const view = renderWithIntl(<FilePicker label="File" />, locale);
    expect(screen.getByText(choose)).toBeTruthy();
    expect(screen.getByText(none)).toBeTruthy();
    if (locale !== "fa") expect(view.container.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });
});
