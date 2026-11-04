import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./visual",
  fullyParallel: true,
  use: { baseURL: "http://127.0.0.1:6006", viewport: { width: 1280, height: 900 }, colorScheme: "light" },
  webServer: { command: "python3 -m http.server 6006 -d storybook-static", port: 6006, reuseExistingServer: !process.env.CI },
});
