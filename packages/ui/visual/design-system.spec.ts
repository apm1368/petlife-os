import { expect, test } from "@playwright/test";

const matrix = ["fa-light", "fa-dark", "en-light", "en-dark", "ar-light", "ar-dark"] as const;

for (const scenario of matrix) {
  test(`design-system coverage: ${scenario}`, async ({ page }) => {
    await page.goto(`/iframe.html?id=design-system-coverage--${scenario}`);
    await expect(page.locator("body")).toHaveScreenshot(`coverage-${scenario}.png`, { fullPage: true, animations: "disabled" });
  });
}
