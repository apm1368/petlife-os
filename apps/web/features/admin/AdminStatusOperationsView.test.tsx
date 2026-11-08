import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminHelpCenterService } from "@/services/admin-help-center.service";
import { AdminStatusOperationsView } from "./AdminStatusOperationsView";

vi.mock("@/services/admin-help-center.service", () => ({ adminHelpCenterService: {
  categories: vi.fn(), articles: vi.fn(), saveArticle: vi.fn(), publishArticle: vi.fn(), unpublishArticle: vi.fn(), articleVersions: vi.fn(), rollbackArticle: vi.fn(), createCategory: vi.fn(),
  legalDocuments: vi.fn(), legalVersions: vi.fn(), saveLegalVersion: vi.fn(), publishLegalVersion: vi.fn(), unpublishLegal: vi.fn(), incidents: vi.fn(), openIncident: vi.fn(), updateIncident: vi.fn(), maintenance: vi.fn(), scheduleMaintenance: vi.fn(), cancelMaintenance: vi.fn(),
} }));

describe("AdminStatusOperationsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminHelpCenterService.incidents).mockResolvedValue([]);
    vi.mocked(adminHelpCenterService.maintenance).mockResolvedValue([]);
  });

  it("creates an incident only from the operator-supplied record", async () => {
    vi.mocked(adminHelpCenterService.openIncident).mockResolvedValue({ id: "incident-1", title: "Image upload delay", impact: "MINOR", status: "INVESTIGATING", components: [], startedAt: "2026-11-06T00:00:00Z", resolvedAt: null, updates: [] });
    renderWithIntl(<AdminStatusOperationsView />);
    fireEvent.change(await screen.findByLabelText("Incident title"), { target: { value: "Image upload delay" } });
    fireEvent.change(screen.getByLabelText("Update details"), { target: { value: "Investigating reports received from users." } });
    fireEvent.click(screen.getByRole("button", { name: "Open incident" }));
    await waitFor(() => expect(adminHelpCenterService.openIncident).toHaveBeenCalledWith({ title: "Image upload delay", impact: "MINOR", components: [], body: "Investigating reports received from users." }));
  });
});
