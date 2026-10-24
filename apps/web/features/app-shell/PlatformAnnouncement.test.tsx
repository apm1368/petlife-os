import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { platformSettingsService } from "@/services/platform-settings.service";
import { PlatformAnnouncement } from "./PlatformAnnouncement";
vi.mock("@/services/platform-settings.service", () => ({
  platformSettingsService: { publicSettings: vi.fn() },
}));
const svc = vi.mocked(platformSettingsService);
beforeEach(() => vi.resetAllMocks());
it("renders the actual localized announcement as plain text, preserving private setting separation", async () => {
  svc.publicSettings.mockResolvedValue({
    "platform.announcement": { fa: "اطلاعیهٔ سامانه <script>", en: "Platform notice" },
  });
  const { container } = renderWithIntl(<PlatformAnnouncement />, "fa");
  expect(await screen.findByText("اطلاعیهٔ سامانه <script>")).toBeTruthy();
  expect(container.querySelector("script")).toBeNull();
  expect(screen.queryByText("Platform notice")).toBeNull();
});
it("falls back to the available authored language without fabricating a translation", async () => {
  svc.publicSettings.mockResolvedValue({ "platform.announcement": { en: "English announcement only" } });
  renderWithIntl(<PlatformAnnouncement />, "fa");
  const text = await screen.findByText("English announcement only");
  expect(text.lang).toBe("en");
});
it("keeps a missing announcement empty and exposes a real load failure with retry", async () => {
  svc.publicSettings
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ "platform.announcement": null });
  renderWithIntl(<PlatformAnnouncement />);
  fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(screen.queryByRole("complementary")).toBeNull();
});
