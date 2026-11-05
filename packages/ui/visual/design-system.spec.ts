import { expect, test } from "@playwright/test";

const matrix = ["fa-light", "fa-dark", "en-light", "en-dark", "ar-light", "ar-dark"] as const;

for (const scenario of matrix) {
  test(`design-system coverage: ${scenario}`, async ({ page }) => {
    await page.goto(`/iframe.html?id=design-system-coverage--${scenario}`);
    // Storybook's body grows with the rendered font metrics. A full-page screenshot therefore
    // changes height across otherwise equivalent Linux runner images and makes every visual
    // assertion flaky. The configured 1280×900 viewport is the approved comparison frame.
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`coverage-${scenario}.png`, {
      animations: "disabled",
      caret: "hide",
      // Chromium rasterises the self-hosted RTL fonts slightly differently on
      // the GitHub Linux runner than in the pinned local Playwright image.
      // Keep a narrow, documented anti-aliasing budget while still failing a
      // component/layout regression (the frame contains 1,152,000 pixels).
      maxDiffPixels: 12_000,
    });
  });
}
