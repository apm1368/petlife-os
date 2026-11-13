import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { AdminDashboardSummaryDto, AdminSessionContextDto, UserDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { authService } from "@/services/auth.service";
import { adminService } from "@/services/admin.service";
import { useAdminStore } from "@/stores/admin-store";
import { AdminShell } from "./AdminShell";
import { resetQueues } from "./admin-queues";

const route = vi.hoisted(() => ({ pathname: "/en/admin" }));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => route.pathname,
}));
vi.mock("@/services/auth.service", () => ({ authService: { getSession: vi.fn(), logout: vi.fn() } }));
vi.mock("@/services/admin.service", () => ({ adminService: { getMe: vi.fn(), getDashboard: vi.fn(), search: vi.fn() } }));

const SESSION_USER: UserDto = { id: "u1", email: "admin@example.com", phone: null, displayName: "An Admin", avatarUrl: null, locale: "en", themePreference: "SYSTEM", createdAt: "", updatedAt: "" };
const NO_QUEUES: AdminDashboardSummaryDto = {
  openSupportCases: null, openDisputes: null, openTrustCases: null, pendingRefundApprovals: null, openTasks: null,
  pendingVerifications: null, pendingRefundRequests: null, pendingOfferModeration: null, pendingCatalogRequests: null,
  pendingTravelListings: null, pendingSupportNeeds: null, openCommunityReports: null, pendingMemorials: null, openPlaceReports: null, pendingWalletTopUps: null, pendingWalletAdjustments: null, pendingCardDestinationChanges: null, pendingDeletionRequests: null, openOwnershipDisputes: null, openProviderNoShows: null, pendingReviews: null, newSetPetRequests: null, launchKpis: null,
};

function signIn(permissions: string[], extra: Partial<AdminSessionContextDto> = {}) {
  vi.mocked(authService.getSession).mockResolvedValue({ user: SESSION_USER });
  vi.mocked(adminService.getMe).mockResolvedValue({ isAdmin: true, adminUserId: "admin-1", displayName: "Reader", role: "SUPPORT" as never, permissions: permissions as never, ...extra });
}
const sidebar = () => screen.getByRole("complementary");

describe("AdminShell", () => {
  beforeEach(() => {
    route.pathname = "/en/admin";
    push.mockReset();
    resetQueues();
    vi.mocked(authService.getSession).mockReset();
    vi.mocked(adminService.getMe).mockReset();
    vi.mocked(adminService.getDashboard).mockReset().mockResolvedValue(NO_QUEUES);
    vi.mocked(adminService.search).mockReset().mockResolvedValue({ customers: [], orders: [], supportCases: [], searched: { customers: true, orders: false, supportCases: false } });
    useAdminStore.setState({ context: null, status: "idle" });
  });

  it("shows the two-step code screen instead of any admin page while the session owes a code, and loads no admin data", async () => {
    signIn(["customer.view"], { twoStep: { enrolled: true, verified: false, enforced: false, graceEndsAt: null, required: "CHALLENGE" } });
    renderWithIntl(<AdminShell><div>private content</div></AdminShell>);
    expect(await screen.findByRole("heading", { name: "Enter your two-step code" })).toBeTruthy();
    expect(screen.queryByText("private content")).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(adminService.getDashboard).not.toHaveBeenCalled();
  });

  it("reminds an admin without two-step to turn it on, above the page", async () => {
    signIn(["customer.view"], { twoStep: { enrolled: false, verified: false, enforced: true, graceEndsAt: "2026-11-20T08:00:00.000Z", required: "NONE" } });
    renderWithIntl(<AdminShell><div>private content</div></AdminShell>);
    expect(await screen.findByText("private content")).toBeTruthy();
    expect((await screen.findByRole("note")).textContent).toContain("Two-step sign-in is required. Turn it on before");
    expect(screen.getByRole("link", { name: "Turn it on" }).getAttribute("href")).toBe("/en/admin/two-step");
  });

  it("clears old admin identity on bootstrap failure and retries without mounting protected content", async () => {
    useAdminStore.setState({ context: { isAdmin: true, adminUserId: "old", role: "SUPER_ADMIN", permissions: ["customer.view"] } as never, status: "ready" });
    vi.mocked(authService.getSession).mockResolvedValue({ user: SESSION_USER });
    vi.mocked(adminService.getMe).mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ isAdmin: false, adminUserId: null, role: null, displayName: null, permissions: [] });
    renderWithIntl(<AdminShell><div>private content</div></AdminShell>);
    await screen.findByRole("alert");
    expect(screen.queryByText("private content")).toBeNull();
    expect(screen.queryByText("No admin access")).toBeNull();
    expect(useAdminStore.getState().context).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("No admin access");
    expect(adminService.getMe).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["de", "/de/admin/access", "System", "Zugriff und Rollen", "Berechtigungsmatrix", "Kein Admin-Zugriff"],
    ["es", "/es/admin/access", "Sistema", "Acceso y roles", "Matriz de permisos", "Sin acceso de administración"],
  ] as const)("localizes the shell, its breadcrumbs and module tabs in %s", async (locale, pathname, group, accessLabel, matrixTab, deniedLabel) => {
    route.pathname = pathname;
    signIn(["access.view"], { adminUserId: "audit-admin", displayName: "Admin Name", role: "ADMIN" as never });
    const { unmount: unmountAdmin } = renderWithIntl(<AdminShell><div>audit page content</div></AdminShell>, locale);
    await screen.findByText("audit page content");
    expect(within(sidebar()).getByRole("group", { name: group })).toBeTruthy();
    expect(within(sidebar()).getByRole("link", { name: accessLabel }).getAttribute("href")).toBe(pathname);
    expect(within(sidebar()).getByRole("link", { name: accessLabel }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: matrixTab }).getAttribute("href")).toBe(`${pathname}/matrix`);
    expect(document.body.textContent).not.toMatch(/[؀-ۿ]/);
    expect(screen.queryByText(/Missing (de|es)/)).toBeNull();
    unmountAdmin();

    vi.mocked(authService.getSession).mockResolvedValue({ user: SESSION_USER });
    vi.mocked(adminService.getMe).mockResolvedValue({ isAdmin: false, adminUserId: null, displayName: null, role: null, permissions: [] } satisfies AdminSessionContextDto);
    const { unmount } = renderWithIntl(<AdminShell><div>should not appear</div></AdminShell>, locale);
    await screen.findByText(deniedLabel);
    expect(screen.queryByText("should not appear")).toBeNull();
    unmount();
  });

  it("shows a clear message when the session has no admin access", async () => {
    vi.mocked(authService.getSession).mockResolvedValue({ user: SESSION_USER });
    vi.mocked(adminService.getMe).mockResolvedValue({ isAdmin: false, adminUserId: null, displayName: null, role: null, permissions: [] } satisfies AdminSessionContextDto);
    renderWithIntl(<AdminShell><div>content</div></AdminShell>);
    await waitFor(() => expect(screen.getByText("No admin access")).toBeTruthy());
    expect(screen.queryByText("content")).toBeNull();
  });

  it("lists every section expanded, showing only the modules the resolved permissions allow", async () => {
    signIn(["customer.view", "support.view", "support.manage", "dispute.view", "dispute.manage", "task.manage"]);
    renderWithIntl(<AdminShell><div>content</div></AdminShell>);
    await screen.findByText("content");
    const nav = within(sidebar());
    expect(nav.getByRole("group", { name: "Customers" })).toBeTruthy();
    expect(nav.getByRole("link", { name: "Support" }).getAttribute("href")).toBe("/en/admin/support");
    expect(nav.getByRole("link", { name: "Users" }).getAttribute("href")).toBe("/en/admin/users");
    expect(nav.getByRole("link", { name: "Disputes" })).toBeTruthy();
    expect(nav.getByRole("link", { name: "Tasks" })).toBeTruthy();
    // SUPPORT has neither finance.view nor audit.view — those sections and modules must not render at all.
    expect(nav.queryByRole("group", { name: "Finance" })).toBeNull();
    expect(nav.queryByText("Transactions")).toBeNull();
    expect(nav.queryByText("Audit")).toBeNull();
    // Decision 5: the sample-data CRM / customer-affairs workspaces are never offered to a real admin.
    expect(screen.queryByText("CRM")).toBeNull();
    expect(screen.queryByText("Customer Affairs")).toBeNull();
    expect(adminService.getDashboard).toHaveBeenCalledTimes(1);
  });

  it("shows every module for a SUPER_ADMIN with every permission", async () => {
    signIn(["customer.view", "support.view", "dispute.view", "trust.view", "verification.manage", "finance.view", "task.manage", "audit.view", "admin.manage"], { role: "SUPER_ADMIN" as never });
    renderWithIntl(<AdminShell><div>content</div></AdminShell>);
    await screen.findByText("content");
    const nav = within(sidebar());
    expect(nav.getByRole("group", { name: "Finance" })).toBeTruthy();
    expect(nav.getByText("Transactions")).toBeTruthy();
    expect(nav.getByText("Audit")).toBeTruthy();
    expect(nav.getByRole("link", { name: "Partners & verification" }).getAttribute("href")).toBe("/en/admin/verification");
  });

  it("lands a module on the first tab the admin may open", async () => {
    signIn(["customer.view"]);
    renderWithIntl(<AdminShell><div>read-only shell</div></AdminShell>);
    await screen.findByText("read-only shell");
    expect(within(sidebar()).getByRole("link", { name: "Partners & verification" }).getAttribute("href")).toBe("/en/admin/providers");
    expect(within(sidebar()).queryByRole("link", { name: "Services & bookings" })).toBeNull();
  });

  it("offers settings with view permission without exposing other system tools", async () => {
    signIn(["settings.view"]);
    renderWithIntl(<AdminShell><div>settings shell</div></AdminShell>);
    await screen.findByText("settings shell");
    const nav = within(sidebar());
    expect(nav.getByRole("link", { name: "Platform settings" }).getAttribute("href")).toBe("/en/admin/settings");
    expect(nav.getByRole("link", { name: "Site settings" }).getAttribute("href")).toBe("/en/admin/site-settings");
    expect(nav.queryByText("Audit")).toBeNull();
    expect(nav.queryByText("Access & roles")).toBeNull();
  });

  it("marks the current module, draws its tabs and breadcrumbs, and follows route changes", async () => {
    route.pathname = "/en/admin/providers/organization-1";
    signIn(["customer.view"]);
    const view = renderWithIntl(<AdminShell><div>provider content</div></AdminShell>);
    await screen.findByText("provider content");
    expect(within(sidebar()).getByRole("link", { name: "Partners & verification" }).getAttribute("aria-current")).toBe("page");
    expect(within(sidebar()).getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBeNull();
    const tabs = within(screen.getByRole("navigation", { name: "Partners & verification sections" }));
    expect(tabs.getByRole("link", { name: "Services" }).getAttribute("aria-current")).toBe("page");
    expect(tabs.getByRole("link", { name: "Shops" }).getAttribute("aria-current")).toBeNull();
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(crumbs.textContent).toBe("AdminMarketplacePartners & verificationServicesDetails");
    route.pathname = "/en/admin/sellers/seller-1";
    view.rerender(<NextIntlClientProvider locale="en" messages={en}><AdminShell><div>seller content</div></AdminShell></NextIntlClientProvider>);
    await waitFor(() => expect(within(screen.getByRole("navigation", { name: "Partners & verification sections" })).getByRole("link", { name: "Shops" }).getAttribute("aria-current")).toBe("page"));
  });

  it("puts waiting-queue counts on modules and tabs", async () => {
    route.pathname = "/en/admin/trust";
    signIn(["trust.view", "support.view"]);
    vi.mocked(adminService.getDashboard).mockResolvedValue({ ...NO_QUEUES, openSupportCases: 7, openTrustCases: 2, openCommunityReports: 3, pendingMemorials: 0 });
    renderWithIntl(<AdminShell><div>trust content</div></AdminShell>);
    await screen.findByText("trust content");
    await waitFor(() => expect(within(sidebar()).getByRole("link", { name: /Support.*7 waiting/ })).toBeTruthy());
    expect(within(sidebar()).getByRole("link", { name: /Trust & Safety.*5 waiting/ })).toBeTruthy();
    const tabs = within(screen.getByRole("navigation", { name: "Trust & Safety sections" }));
    expect(tabs.getByRole("link", { name: /User reports.*3 waiting/ })).toBeTruthy();
    expect(tabs.getByRole("link", { name: "Memorials" })).toBeTruthy();
  });

  it("opens the command palette with Ctrl+K and jumps to a filtered page", async () => {
    signIn(["customer.view", "dispute.view"]);
    renderWithIntl(<AdminShell><div>palette content</div></AdminShell>);
    await screen.findByText("palette content");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const dialog = await screen.findByRole("dialog", { name: "Quick search" });
    fireEvent.change(within(dialog).getByRole("combobox"), { target: { value: "disp" } });
    const option = within(dialog).getByRole("option", { name: "Disputes" });
    fireEvent.click(option);
    expect(push).toHaveBeenCalledWith("/en/admin/disputes");
    expect(screen.queryByRole("dialog", { name: "Quick search" })).toBeNull();
  });

  it("keeps mobile navigation permission-filtered and closes after choosing a page", async () => {
    signIn(["customer.view"]);
    renderWithIntl(<AdminShell><div>mobile content</div></AdminShell>);
    await screen.findByText("mobile content");
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("link", { name: "Transactions" })).toBeNull();
    expect(within(dialog).queryByRole("link", { name: "CRM" })).toBeNull();
    const partners = within(dialog).getByRole("link", { name: "Partners & verification" });
    partners.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(partners);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers sign-out from the account menu", async () => {
    signIn(["customer.view"], { displayName: "Reader" });
    renderWithIntl(<AdminShell><div>account content</div></AdminShell>);
    await screen.findByText("account content");
    fireEvent.click(within(sidebar()).getByRole("button", { name: "Account menu for Reader" }));
    const menu = screen.getByRole("menu", { name: "Account" });
    expect(within(menu).getByRole("menuitem", { name: "Sign out" })).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: "View site" }).getAttribute("href")).toBe("/en");
  });
});
