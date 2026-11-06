import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminHelpCenterService } from "@/services/admin-help-center.service";
import { AdminHelpLegalView } from "./AdminHelpLegalView";

vi.mock("@/services/admin-help-center.service", () => ({ adminHelpCenterService: {
  categories: vi.fn(), articles: vi.fn(), saveArticle: vi.fn(), publishArticle: vi.fn(), unpublishArticle: vi.fn(), articleVersions: vi.fn(), rollbackArticle: vi.fn(), createCategory: vi.fn(),
  legalDocuments: vi.fn(), legalVersions: vi.fn(), saveLegalVersion: vi.fn(), publishLegalVersion: vi.fn(), unpublishLegal: vi.fn(), incidents: vi.fn(), openIncident: vi.fn(), updateIncident: vi.fn(), maintenance: vi.fn(), scheduleMaintenance: vi.fn(), cancelMaintenance: vi.fn(),
} }));

describe("AdminHelpLegalView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminHelpCenterService.categories).mockResolvedValue([]);
    vi.mocked(adminHelpCenterService.articles).mockResolvedValue([]);
    vi.mocked(adminHelpCenterService.legalDocuments).mockResolvedValue([]);
    vi.mocked(adminHelpCenterService.legalVersions).mockResolvedValue([]);
  });

  it("lets a content editor create a real bilingual Help category before authoring articles", async () => {
    vi.mocked(adminHelpCenterService.createCategory).mockResolvedValue({ id: "category-1", slug: "pet-care", titleFa: "مراقبت پت", titleEn: "Pet care", isActive: true });
    renderWithIntl(<AdminHelpLegalView />);
    fireEvent.click(await screen.findByText("Create a help category"));
    fireEvent.change(screen.getByLabelText("Slug (lowercase English)"), { target: { value: "pet-care" } });
    fireEvent.change(screen.getByLabelText("عنوان فارسی"), { target: { value: "مراقبت پت" } });
    fireEvent.change(screen.getByLabelText("English title"), { target: { value: "Pet care" } });
    fireEvent.click(screen.getByRole("button", { name: "Create category" }));
    await waitFor(() => expect(adminHelpCenterService.createCategory).toHaveBeenCalledWith({ slug: "pet-care", titleFa: "مراقبت پت", titleEn: "Pet care" }));
  });

  it("loads published legal version metadata from the admin API without inserting default text", async () => {
    renderWithIntl(<AdminHelpLegalView />);
    fireEvent.click(await screen.findByRole("button", { name: "Legal documents" }));
    expect(await screen.findByText("No version has been saved for this document.")).toBeTruthy();
    expect(adminHelpCenterService.legalVersions).toHaveBeenCalledWith("TERMS_OF_SERVICE", "en");
    expect(screen.queryByText(/sample text|lorem ipsum/i)).toBeNull();
  });
});
