import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminPartnersService } from "@/services/admin-partners.service";
import { useAdminStore } from "@/stores/admin-store";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { AdminPartnerDirectory } from "./AdminPartnerDirectory";

vi.mock("@/services/admin-partners.service", () => ({
  adminPartnersService: { listServices: vi.fn(), listShops: vi.fn() },
}));

const service = {
  id: "org1",
  name: "Real partner",
  logoUrl: null,
  type: "GROOMER",
  serviceKinds: ["GROOMER", "BOARDING"],
  phone: "02100000000",
  city: "Tehran",
  province: "Tehran",
  verificationStatus: "UNDER_REVIEW",
  submittedAt: "2026-11-13T08:00:00Z",
  isDemoRecord: false,
  activeServices: 0,
  inactiveServices: 2,
  pendingDocuments: 2,
  linkedShop: { id: "shop1", name: "Real partner shop", status: "PENDING", verificationStatus: "SUBMITTED" },
  createdAt: "2026-11-13T07:00:00Z",
};
const shop = {
  id: "shop1",
  name: "Real partner",
  logoUrl: null,
  phone: null,
  city: "Tehran",
  province: "Tehran",
  status: "PENDING",
  verificationStatus: "SUBMITTED",
  submittedAt: null,
  activeOffers: 0,
  pendingOffers: 3,
  pendingDocuments: 0,
  linkedService: { id: "org1", name: "Real partner", type: "GROOMER", verificationStatus: "UNDER_REVIEW", status: null },
  createdAt: "2026-11-13T07:00:00Z",
};
const page = <T,>(row: T, name = "Real partner", total = 1) => ({ items: [{ ...row, name }], total, page: 1, pageSize: 30 });

function permissions(values: string[]) {
  useAdminStore.setState({
    context: { isAdmin: true, adminUserId: "a1", displayName: "Operator", role: "SUPPORT", permissions: values } as never,
    status: "ready",
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  permissions(["customer.view"]);
  vi.mocked(adminPartnersService.listServices).mockResolvedValue(page(service) as never);
  vi.mocked(adminPartnersService.listShops).mockResolvedValue(page(shop) as never);
});

describe("partner directory", () => {
  it("lists service businesses with their kinds, place, counts and the shop they also run", async () => {
    renderWithIntl(<AdminPartnerDirectory kind="provider" />);
    expect(screen.getByLabelText("Loading…")).toBeTruthy();
    await screen.findByText("Real partner");
    expect(adminPartnersService.listServices).toHaveBeenCalledWith({ q: undefined, verification: undefined, kind: undefined, page: 1, pageSize: 30 });
    expect(screen.getByText(/Tehran · Tehran · 02100000000/)).toBeTruthy();
    expect(screen.getByText(/0 active services · 2 inactive · 2 documents to review/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Real partner" }).getAttribute("href")).toBe("/en/admin/providers/org1");
    expect(screen.getByRole("link", { name: "Also a shop: Real partner shop" }).getAttribute("href")).toBe("/en/admin/sellers/shop1");
    // Read-only staff get no KYC review link.
    expect(screen.queryByRole("link", { name: "Review KYC" })).toBeNull();
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
  });

  it("does not request data without read permission", () => {
    permissions([]);
    renderWithIntl(<AdminPartnerDirectory kind="seller" />);
    expect(screen.getByText("You do not have permission to view partners.")).toBeTruthy();
    expect(adminPartnersService.listShops).not.toHaveBeenCalled();
  });

  it("lets the commerce team read shops and filters by shop status", async () => {
    permissions(["commerce.view"]);
    renderWithIntl(<AdminPartnerDirectory kind="seller" />);
    await screen.findByText("Real partner");
    expect(screen.getByText(/0 live offers · 3 awaiting review/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Also a service business: Real partner" }).getAttribute("href")).toBe("/en/admin/providers/org1");
    fireEvent.change(screen.getByLabelText("Shop status"), { target: { value: "SUSPENDED" } });
    await waitFor(() => expect(adminPartnersService.listShops).toHaveBeenLastCalledWith(expect.objectContaining({ status: "SUSPENDED", page: 1 })));
  });

  it("requests later pages and resets the submitted search to page one", async () => {
    vi.mocked(adminPartnersService.listServices).mockResolvedValue(page(service, "Real partner", 61) as never);
    renderWithIntl(<AdminPartnerDirectory kind="provider" />);
    await screen.findByText("Real partner");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(adminPartnersService.listServices).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
    await screen.findByText("Page 2");
    fireEvent.change(screen.getByLabelText("Name, phone or city"), { target: { value: "  Meadow  " } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(adminPartnersService.listServices).toHaveBeenLastCalledWith(expect.objectContaining({ q: "Meadow", page: 1 })));
  });

  it("keeps the typed search after a load failure and retries instead of pretending the list is empty", async () => {
    vi.mocked(adminPartnersService.listShops).mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(page(shop) as never);
    renderWithIntl(<AdminPartnerDirectory kind="seller" />);
    await screen.findByText("Could not load partners");
    fireEvent.change(screen.getByLabelText("Name, phone or city"), { target: { value: "unsent draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Real partner");
    expect((screen.getByLabelText("Name, phone or city") as HTMLInputElement).value).toBe("unsent draft");
  });

  it("shows the KYC review link only to reviewers", async () => {
    permissions(["verification.manage"]);
    renderWithIntl(<AdminPartnerDirectory kind="seller" />);
    await screen.findByText("Real partner");
    expect(screen.getByRole("link", { name: "Review KYC" }).getAttribute("href")).toBe("/en/admin/verification/seller/shop1");
  });

  it("ignores a late service response when the directory changes to shops", async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(adminPartnersService.listServices).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }) as never,
    );
    const view = renderWithIntl(<AdminPartnerDirectory kind="provider" />);
    view.rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <AdminPartnerDirectory kind="seller" />
      </NextIntlClientProvider>,
    );
    await screen.findByText("Real partner");
    finish(page(service, "Stale provider"));
    await waitFor(() => expect(screen.queryByText("Stale provider")).toBeNull());
  });
});
