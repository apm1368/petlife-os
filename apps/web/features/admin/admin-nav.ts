import type { AdminDashboardSummaryDto, AdminPermissionName } from "@petlife/types";
import {
  ArrowLeftRight,
  ChartColumn,
  ClipboardList,
  CreditCard,
  FileText,
  Gauge,
  Gavel,
  Handshake,
  HeartHandshake,
  Headset,
  Hotel,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  MapPinned,
  MessagesSquare,
  PawPrint,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldPlus,
  ShoppingBag,
  SlidersHorizontal,
  Stethoscope,
  Users,
  Wallet,
} from "@petlife/ui";

/**
 * The back office's single information architecture.
 *
 * Every admin route belongs to exactly one module, and every module to one section. The sidebar shows
 * sections and modules; a module's sub-pages are tabs on the page itself, so the sidebar stays short and a
 * page always knows where it lives (breadcrumbs, tabs and the command palette all read this one table).
 */

export type QueueKey = keyof AdminDashboardSummaryDto;
export type Permission = AdminPermissionName | AdminPermissionName[];
type Icon = typeof LayoutDashboard;

export interface AdminTab {
  /** Path below /admin, "" for the dashboard. */
  href: string;
  labelKey: string;
  permission?: Permission;
  /** Only the exact path is this tab (used by a module's overview tab). */
  exact?: boolean;
  /** Dashboard queue count shown on the tab and summed into the module's sidebar badge. */
  queue?: QueueKey;
}

export interface AdminModule {
  key: string;
  labelKey: string;
  icon: Icon;
  /** Landing path when the module has no tabs; with tabs, the first tab the admin may open. */
  href: string;
  permission?: Permission;
  queue?: QueueKey;
  tabs?: AdminTab[];
  /** Extra route prefixes that belong to this module without being a tab path (detail pages, editors); `tab` is
   *  the tab they highlight. A prefix ending in "/" claims everything below it. */
  owns?: { prefix: string; tab?: string }[];
}

export interface AdminSection {
  key: string;
  modules: AdminModule[];
}

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    key: "overview",
    modules: [
      { key: "dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, href: "" },
      { key: "reports", labelKey: "nav.reports", icon: ChartColumn, href: "/reports", permission: "analytics.view" },
      { key: "tasks", labelKey: "nav.tasks", icon: ClipboardList, href: "/tasks", permission: "task.manage", queue: "openTasks" },
    ],
  },
  {
    key: "customers",
    modules: [
      {
        key: "users",
        labelKey: "nav.users",
        icon: Users,
        href: "/users",
        tabs: [
          { href: "/users", labelKey: "tabs.directory", permission: "customer.view" },
          { href: "/customers", labelKey: "tabs.customer360", permission: "customer.view" },
          { href: "/ownership-transfers", labelKey: "tabs.ownershipTransfers", permission: "customer.view", queue: "openOwnershipDisputes" },
          { href: "/privacy/deletion-requests", labelKey: "tabs.deletionRequests", permission: "admin.manage", queue: "pendingDeletionRequests" },
        ],
      },
      // Each pet with its owner and household members (Pet 360); health appears as counts only.
      { key: "pets", labelKey: "nav.pets", icon: PawPrint, href: "/pets", permission: "customer.view" },
      { key: "support", labelKey: "nav.support", icon: Headset, href: "/support", permission: "support.view", queue: "openSupportCases" },
      { key: "disputes", labelKey: "nav.disputes", icon: Gavel, href: "/disputes", permission: "dispute.view", queue: "openDisputes" },
      {
        key: "subscriptions",
        labelKey: "nav.subscriptions",
        icon: CreditCard,
        href: "/subscriptions",
        tabs: [
          { href: "/subscriptions", labelKey: "tabs.plans", permission: "subscription.view", exact: true },
          { href: "/subscriptions/households", labelKey: "tabs.households", permission: "subscription.view" },
        ],
      },
    ],
  },
  {
    key: "marketplace",
    modules: [
      {
        key: "partners",
        labelKey: "nav.partners",
        icon: Handshake,
        href: "/verification",
        tabs: [
          { href: "/verification", labelKey: "tabs.verification", permission: "verification.manage", queue: "pendingVerifications" },
          { href: "/providers", labelKey: "tabs.providers", permission: ["verification.manage", "customer.view"] },
          { href: "/sellers", labelKey: "tabs.sellers", permission: ["verification.manage", "customer.view"] },
        ],
      },
      {
        key: "commerce",
        labelKey: "nav.commerce",
        icon: ShoppingBag,
        href: "/commerce",
        tabs: [
          { href: "/commerce", labelKey: "tabs.overview", permission: "commerce.view", exact: true },
          { href: "/commerce/orders", labelKey: "tabs.orders", permission: "commerce.view" },
          { href: "/commerce/refund-requests", labelKey: "tabs.refundRequests", permission: "commerce.view", queue: "pendingRefundRequests" },
          { href: "/commerce/products", labelKey: "tabs.products", permission: "commerce.view" },
          { href: "/commerce/product-moderation", labelKey: "tabs.offerModeration", permission: "commerce.view", queue: "pendingOfferModeration" },
          { href: "/commerce/catalog-product-requests", labelKey: "tabs.catalogRequests", permission: "commerce.view", queue: "pendingCatalogRequests" },
          { href: "/commerce/catalog-imports", labelKey: "tabs.catalogImports", permission: "commerce.view" },
          { href: "/commerce/inventory", labelKey: "tabs.inventory", permission: "commerce.view" },
          { href: "/commerce/reviews", labelKey: "tabs.reviews", permission: "commerce.view" },
          { href: "/commerce/sellers", labelKey: "tabs.sellerStores", permission: "commerce.view" },
          { href: "/commerce/promotions", labelKey: "tabs.promotions", permission: "commerce.view" },
        ],
      },
      {
        key: "services",
        labelKey: "nav.services",
        icon: Stethoscope,
        href: "/services",
        tabs: [
          { href: "/services", labelKey: "tabs.bookings", permission: "services.view", exact: true },
          { href: "/services/catalog", labelKey: "tabs.serviceCatalog", permission: "services.view" },
          { href: "/services/reviews", labelKey: "tabs.reviews", permission: "services.view" },
          { href: "/services/analytics", labelKey: "tabs.analytics", permission: "services.view" },
        ],
        owns: [{ prefix: "/services/bookings", tab: "/services" }],
      },
      {
        key: "travel",
        labelKey: "nav.travel",
        icon: Hotel,
        href: "/travel",
        tabs: [
          { href: "/travel", labelKey: "tabs.listings", permission: "travel.view", exact: true, queue: "pendingTravelListings" },
          { href: "/travel/bookings", labelKey: "tabs.bookings", permission: "travel.view" },
          { href: "/travel/reviews", labelKey: "tabs.reviews", permission: "travel.view" },
          { href: "/travel/requirements", labelKey: "tabs.requirements", permission: "travel.view" },
          { href: "/travel/partners", labelKey: "tabs.travelPartners", permission: "travel.view" },
          { href: "/travel/analytics", labelKey: "tabs.analytics", permission: "travel.view" },
          { href: "/travel/external", labelKey: "tabs.externalSources", permission: "travel.source.view" },
        ],
        owns: [{ prefix: "/travel/listings", tab: "/travel" }],
      },
      {
        key: "insurance",
        labelKey: "nav.insurance",
        icon: ShieldPlus,
        href: "/insurance",
        tabs: [
          { href: "/insurance", labelKey: "tabs.applications", permission: "insurance.applications.view", exact: true },
          { href: "/insurance/providers", labelKey: "tabs.insuranceProviders", permission: "insurance.view" },
        ],
      },
      { key: "places", labelKey: "nav.places", icon: MapPinned, href: "/places", permission: "places.view", queue: "openPlaceReports" },
    ],
  },
  {
    key: "trust",
    modules: [
      {
        key: "trust",
        labelKey: "nav.trust",
        icon: ShieldAlert,
        href: "/trust",
        tabs: [
          { href: "/trust", labelKey: "tabs.trustCases", permission: "trust.view", queue: "openTrustCases" },
          { href: "/community", labelKey: "tabs.communityReports", permission: "trust.view", queue: "openCommunityReports" },
          { href: "/lost-pets", labelKey: "tabs.lostPets", permission: "trust.view" },
          { href: "/pet-memorials", labelKey: "tabs.memorials", permission: "trust.view", queue: "pendingMemorials" },
        ],
      },
      {
        key: "animalSupport",
        labelKey: "nav.animalSupport",
        icon: HeartHandshake,
        href: "/animal-support",
        tabs: [
          { href: "/animal-support", labelKey: "tabs.overview", permission: "animalSupport.view", exact: true },
          { href: "/animal-support/needs", labelKey: "tabs.needs", permission: "trust.view", queue: "pendingSupportNeeds" },
          { href: "/animal-support/organizations", labelKey: "tabs.organizations", permission: "animalSupport.view" },
          { href: "/animal-support/rescue-cases", labelKey: "tabs.rescues", permission: "animalSupport.view" },
          { href: "/animal-support/campaigns", labelKey: "tabs.campaigns", permission: "animalSupport.view" },
          { href: "/animal-support/donations", labelKey: "tabs.donations", permission: "animalSupport.view" },
        ],
      },
    ],
  },
  {
    key: "finance",
    modules: [
      { key: "transactions", labelKey: "nav.transactions", icon: ArrowLeftRight, href: "/transactions", permission: "finance.view", queue: "pendingRefundApprovals" },
      {
        key: "sellerFinance",
        labelKey: "nav.sellerFinance",
        icon: Landmark,
        href: "/seller-finance",
        tabs: [
          { href: "/seller-finance", labelKey: "tabs.balances", permission: "sellerFinance.view" },
          { href: "/reconciliation", labelKey: "tabs.reconciliation", permission: "sellerFinance.view" },
          { href: "/marketplace-statements", labelKey: "tabs.statements", permission: "sellerFinance.view" },
        ],
        owns: [{ prefix: "/settlements", tab: "/seller-finance" }],
      },
      {
        key: "wallets",
        labelKey: "nav.wallets",
        icon: Wallet,
        href: "/wallets",
        tabs: [
          { href: "/wallets", labelKey: "tabs.walletDirectory", permission: "wallet.view" },
          { href: "/wallets/top-ups", labelKey: "tabs.walletTopUps", permission: "wallet.view", queue: "pendingWalletTopUps" },
        ],
      },
    ],
  },
  {
    key: "content",
    modules: [
      {
        key: "content",
        labelKey: "nav.content",
        icon: FileText,
        href: "/content",
        tabs: [
          { href: "/content", labelKey: "tabs.articles", permission: "content.view", exact: true },
          { href: "/content/categories", labelKey: "tabs.categories", permission: "content.view" },
          { href: "/content/tags", labelKey: "tabs.tags", permission: "content.view" },
          { href: "/content/authors", labelKey: "tabs.authors", permission: "content.view" },
          { href: "/content/media", labelKey: "tabs.media", permission: "content.view" },
          { href: "/content/placements", labelKey: "tabs.placements", permission: "content.view" },
        ],
        owns: [{ prefix: "/content/", tab: "/content" }],
      },
      { key: "helpCenter", labelKey: "nav.helpCenter", icon: LifeBuoy, href: "/help-center", permission: "content.view" },
    ],
  },
  {
    key: "system",
    modules: [
      { key: "siteSettings", labelKey: "nav.siteSettings", icon: SlidersHorizontal, href: "/site-settings", permission: "settings.view" },
      {
        key: "access",
        labelKey: "nav.access",
        icon: KeyRound,
        href: "/access",
        tabs: [
          { href: "/access", labelKey: "tabs.adminsRoles", permission: "access.view" },
          { href: "/access/roles", labelKey: "tabs.customRoles", permission: "access.view" },
          { href: "/access/matrix", labelKey: "tabs.permissionMatrix", permission: "access.view" },
        ],
      },
      {
        key: "settings",
        labelKey: "nav.settings",
        icon: Settings,
        href: "/settings",
        tabs: [
          { href: "/settings", labelKey: "tabs.platformSettings", permission: "settings.view" },
          { href: "/feature-flags", labelKey: "tabs.featureFlags", permission: "settings.view" },
        ],
      },
      {
        key: "messaging",
        labelKey: "nav.messaging",
        icon: MessagesSquare,
        href: "/messaging",
        tabs: [
          { href: "/messaging", labelKey: "tabs.channels", permission: "system.view" },
          { href: "/sms-patterns", labelKey: "tabs.smsPatterns", permission: "system.view" },
        ],
      },
      { key: "status", labelKey: "nav.systemStatus", icon: Gauge, href: "/status", permission: "support.view" },
      { key: "audit", labelKey: "nav.audit", icon: ScrollText, href: "/audit", permission: "audit.view" },
    ],
  },
];

export function allows(permissions: ReadonlySet<string>, permission?: Permission): boolean {
  if (!permission) return true;
  return Array.isArray(permission) ? permission.some((p) => permissions.has(p)) : permissions.has(permission);
}

export interface VisibleModule extends AdminModule {
  /** The tabs this admin may open (empty when the module has no tabs). */
  visibleTabs: AdminTab[];
}

export interface VisibleSection {
  key: string;
  modules: VisibleModule[];
}

/** The sections and modules an admin may open; a tabbed module lands on its first permitted tab. */
export function visibleSections(permissions: ReadonlySet<string>): VisibleSection[] {
  return ADMIN_SECTIONS.map((section) => ({
    key: section.key,
    modules: section.modules
      .map((mod): VisibleModule | null => {
        if (!mod.tabs) return allows(permissions, mod.permission) ? { ...mod, visibleTabs: [] } : null;
        const visibleTabs = mod.tabs.filter((tab) => allows(permissions, tab.permission));
        if (!visibleTabs.length || !allows(permissions, mod.permission)) return null;
        return { ...mod, href: visibleTabs[0]!.href, visibleTabs };
      })
      .filter((m): m is VisibleModule => m !== null),
  })).filter((section) => section.modules.length > 0);
}

/** Does `path` (below /admin) fall under `prefix`? Matches whole segments: /content never claims /contentx. */
export function under(path: string, prefix: string, exact = false): boolean {
  if (prefix === "") return path === "";
  if (exact) return path === prefix;
  if (prefix.endsWith("/")) return path.startsWith(prefix);
  return path === prefix || path.startsWith(`${prefix}/`);
}

export interface RouteMatch {
  section: VisibleSection;
  module: VisibleModule;
  /** The tab the page belongs to, if any. */
  tab?: AdminTab;
  /** Path segments below the tab or module root (detail pages, editors). */
  rest: string[];
}

/** Which module, tab and section a path below /admin belongs to — the longest matching prefix wins. */
export function matchRoute(sections: VisibleSection[], path: string): RouteMatch | null {
  let best: (RouteMatch & { score: number }) | null = null;
  for (const section of sections) {
    for (const mod of section.modules) {
      const candidates: { prefix: string; tab?: AdminTab; exact?: boolean; owned?: boolean }[] = [
        ...mod.visibleTabs.map((tab) => ({ prefix: tab.href, tab, exact: tab.exact })),
        ...(mod.visibleTabs.length ? [] : [{ prefix: mod.href }]),
        ...(mod.owns ?? []).map((own) => ({ prefix: own.prefix, tab: mod.visibleTabs.find((t) => t.href === own.tab), owned: true })),
      ];
      for (const candidate of candidates) {
        if (!under(path, candidate.prefix, candidate.exact)) continue;
        const score = candidate.prefix.length + (candidate.tab && !candidate.owned ? 0.5 : 0);
        if (best && best.score >= score) continue;
        const base = candidate.prefix.replace(/\/$/, "");
        const rest = path.slice(base.length).split("/").filter(Boolean);
        best = { section, module: mod, tab: candidate.tab, rest, score };
      }
    }
  }
  if (!best) return null;
  const { score: _score, ...match } = best;
  return match;
}

/** Sum of the queue counts a module carries (its own and its tabs'). Null when none are visible. */
export function moduleQueueCount(mod: VisibleModule, summary: AdminDashboardSummaryDto | null): number | null {
  if (!summary) return null;
  const keys = [mod.queue, ...mod.visibleTabs.map((t) => t.queue)].filter((k): k is QueueKey => Boolean(k));
  const values = keys.map((k) => summary[k]).filter((v): v is number => typeof v === "number");
  return values.length ? values.reduce((a, b) => a + b, 0) : null;
}
