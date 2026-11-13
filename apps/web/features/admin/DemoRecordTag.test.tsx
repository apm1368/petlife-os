import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { DemoRecordTag } from "./DemoRecordTag";

describe("DemoRecordTag", () => {
  it("labels demo rows as hidden on the live site, in Persian and English", () => {
    const { unmount } = renderWithIntl(<DemoRecordTag isDemoRecord />, "fa");
    expect(screen.getByText("نمایشی — در سایت عمومی پنهان")).toBeTruthy();
    unmount();
    renderWithIntl(<DemoRecordTag isDemoRecord />, "en");
    expect(screen.getByText("Demo — hidden on the live site").getAttribute("title")).toMatch(/never shows it/);
  });

  it("renders nothing for real records", () => {
    const { container } = renderWithIntl(<DemoRecordTag isDemoRecord={false} />, "en");
    expect(container.textContent).toBe("");
  });
});
