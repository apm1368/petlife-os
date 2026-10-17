const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const appRoot = path.join(root, "apps/web/app");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function toRoute(file) {
  const segments = path.relative(appRoot, file).split(path.sep);
  const visible = segments
    .filter((segment) => !/^\(.+\)$/.test(segment))
    .filter((segment) => segment !== "page.tsx")
    .map((segment) => (segment === "[locale]" ? ":locale" : segment.replace(/^\[(.+)\]$/, ":$1")));
  return `/${visible.join("/")}`;
}

function actor(route) {
  if (route.includes("/admin")) return "Admin";
  if (route.includes("/provider")) return "Provider staff";
  if (route.includes("/seller")) return "Seller staff";
  if (/\/(auth|account|register|welcome)(\/|$)/.test(route)) return "Guest / member";
  if (/\/(blog|shop|services|vet|places|lost-pets|insurance|animal-support|community)(\/|$)/.test(route)) return "Public / member";
  return route === "/:locale" ? "Public" : "Member";
}

function domain(route) {
  if (route === "/:locale") return "Landing";
  if (route.includes("/admin/content")) return "Admin Content / CMS";
  if (route.includes("/admin/customers")) return "Admin Customers";
  if (route.includes("/admin/providers") || route.includes("/admin/sellers")) return "Admin Partners";
  if (route.includes("/admin/subscriptions")) return "Admin Subscription";
  if (route.includes("/admin/support") || route.includes("/admin/disputes") || route.includes("/admin/trust")) return "Admin Support / Trust";
  if (route.includes("/admin/transactions") || route.includes("/admin/seller-finance") || route.includes("/admin/settlements") || route.includes("/admin/reconciliation")) return "Admin Finance";
  if (route.includes("/admin/audit")) return "Logs / Audit";
  if (route.includes("/admin/crm")) return "CRM";
  if (route.includes("/admin/customer-affairs")) return "Customer Affairs";
  if (route.includes("/admin")) return "Admin Overview";
  if (route.includes("/provider")) return "Provider OS";
  if (route.includes("/seller")) return "Seller OS";
  if (/\/(auth|account|register|welcome)(\/|$)/.test(route)) return "Auth";
  if (route.includes("/onboarding")) return "Onboarding";
  if (route.includes("/profile")) return "Profile";
  if (route.includes("/subscription")) return "Subscription";
  if (route.includes("/care-calendar") || route.includes("/care")) return "Care / Reminders";
  if (route.includes("/health/advanced/documents")) return "Documents";
  if (route.includes("/health")) return "Health";
  if (route.includes("/memories")) return "Memories";
  if (route.includes("/lost")) return "Lost Pet";
  if (route.includes("/pets") && route.includes("/travel")) return "Pet Travel";
  if (route.includes("/pets")) return "Pets / Pet Profile";
  if (route.includes("/bookings")) return "Booking";
  if (route.includes("/vet")) return "Vet";
  if (route.includes("/services")) return "Services";
  if (route.includes("/cart")) return "Cart";
  if (route.includes("/checkout")) return "Checkout";
  if (route.includes("/orders")) return "Orders";
  if (route.includes("/shop")) return "Commerce";
  if (route.includes("/insurance")) return "Insurance";
  if (route.includes("/places")) return "Places";
  if (route.includes("/animal-support") || route.includes("/donations")) return "Animal Support";
  if (route.includes("/community")) return "Community";
  if (route.includes("/notifications")) return "Notifications";
  if (route.includes("/support")) return "Support";
  if (route.includes("/blog")) return "Blog";
  if (route.includes("/ai")) return "AI";
  if (route.includes("/home")) return "Member Home";
  return "Other";
}

function authRequirement(route, routeActor) {
  if (routeActor === "Admin") return "Admin session/role; local review is read-only bypass";
  if (routeActor === "Provider staff") return "Provider session/role; local review is read-only bypass";
  if (routeActor === "Seller staff") return "Seller session/role; local review is read-only bypass";
  if (routeActor.startsWith("Public") || route === "/:locale" || routeActor === "Guest / member") return "Public browse; session required for protected mutations where applicable";
  return "Member session; local review bypass exists";
}

function apiDependency(pageDomain) {
  const map = {
    Landing: "None for hero; public navigation only",
    Auth: "Auth / Users / external OTP-email-OAuth adapters",
    Onboarding: "Onboarding / Pets / Households",
    Profile: "Users / Households",
    Subscription: "Subscriptions / billing provider",
    "Care / Reminders": "Care Calendar / Care Profile / Notifications",
    Documents: "Clinical Health / Storage",
    Health: "Health / Clinical Health / Storage",
    Memories: "Memories / Storage",
    "Lost Pet": "Lost Pet / Storage / messaging",
    "Pet Travel": "Travel readiness / Pets / Health",
    "Pets / Pet Profile": "Pets / Pet Access / Households",
    Booking: "Bookings / Providers / Services / Notifications",
    Vet: "Providers / Services / Booking",
    Services: "Services / Providers / Booking",
    Cart: "Cart / Catalog / Pet Access",
    Checkout: "Checkout / Payment / Financing / Logistics / Orders",
    Orders: "Orders / Fulfillment / Refunds / Logistics",
    Commerce: "Catalog / Marketplace / Storage",
    Insurance: "Insurance",
    Places: "Places / geospatial database",
    "Animal Support": "Animal Support / Storage / Notifications",
    Community: "Community / Storage",
    Notifications: "Notifications / SMS-email-push adapters",
    Support: "Support / Notifications",
    Blog: "Content / CMS / Storage",
    "Admin Content / CMS": "Content / Storage / Audit",
    "Admin Customers": "Admin / Users / Pets / Orders / Support",
    "Admin Partners": "Admin / Provider OS / Seller OS / Verification",
    "Admin Subscription": "Admin / Subscriptions / Billing",
    "Admin Support / Trust": "Admin / Support / Disputes / Trust",
    "Admin Finance": "Payments / Ledger / Seller Finance / Reconciliation",
    "Logs / Audit": "Admin audit APIs",
    CRM: "None: sample-only workspace",
    "Customer Affairs": "None: sample-only workspace",
    "Admin Overview": "Admin aggregate endpoints",
    "Provider OS": "Provider OS / Vet Panel / Booking / Clinical Health",
    "Seller OS": "Seller OS / Orders / Inventory / Finance / Marketplace",
    AI: "No production AI capability wired",
    "Member Home": "Home aggregates / session context",
  };
  return map[pageDomain] || "Domain API";
}

/**
 * Batch 2 (Pet Profile + Health + Care + Share With Vet) routes. Function A needs actions, permissions,
 * state handling and runtime verified; Visual A needs the canonical pattern checked responsive in fa RTL and en LTR.
 * Grades here are raised only from recorded evidence (e2e suites + live staging QA), never from build success alone.
 */
function isBatch2(route) {
  return /\/pets\/:id(\/health|\/care|$)/.test(route) || route.endsWith("/care-calendar") || route.includes("/provider/shared-records");
}
/** Batch 3 (Services + Vet + Discovery + Booking + provider/admin operations). Same evidence rule as Batch 2. */
function isBatch3(route) {
  return (
    /\/:locale\/(services|vet|providers|bookings)(\/|$)/.test(route) ||
    /\/provider\/(bookings|calendar|services|team|waitlist|reviews|analytics|availability)(\/|$)/.test(route) ||
    route.includes("/admin/services")
  );
}
const BATCH3_GRADE = {
  function: "B",
  visual: "B",
  blockers: "Batch 3: API lifecycle + security e2e green (batch3-booking 21 tests), web tests green, live since 2026-09-27. Public pages QA'd live fa/en desktop/mobile; authenticated customer/provider pages QA'd fa/en desktop/mobile on the isolated preview (QA seed, no live data) with no overflow/console errors. Native date inputs now show the Jalali reading (full Jalali picker still open). Real payment gateway credentials BLOCKED_EXTERNAL (sandbox only); map provider not configured.",
};

const BATCH2_GRADE = {
  function: "B",
  visual: "B",
  blockers: "Batch 2: API security matrix green (batch2-care-share, batch2-security-matrix, clinical-health), live since 2026-09-27. Authenticated pet overview/health/care/calendar QA'd fa RTL + en LTR, desktop 1440 + mobile 390, on the isolated preview with the Batch 2 QA seed: no overflow, no stuck skeletons, no console errors.",
};

/** Batch 4 (Commerce: discovery, PDP, cart, checkout, orders, repeat delivery, seller + admin commerce). */
function isBatch4(route) {
  return (
    /\/:locale\/(shop|cart|checkout|orders|repeat-delivery|favorites)(\/|$)/.test(route) ||
    /\/seller\/(orders|offers|promotions|inventory)(\/|$)/.test(route) ||
    route.includes("/admin/commerce")
  );
}
const BATCH4_GRADE = {
  function: "B",
  visual: "B",
  blockers: "Batch 4: batch4-commerce e2e (22: tampering, IDOR, seller isolation, RBAC, inventory/refund races, repeat delivery) + full API suite + web tests green; browser purchase → sandbox payment → cancel/refund verified on the isolated preview; fa/en desktop/mobile QA clean for customer, seller and admin pages. Live online payment BLOCKED_EXTERNAL (sandbox only); courier adapters are stubs without credentials; live QA after deploy recorded in docs/qa/batch-4-commerce.md.",
};

/**
 * Batch 8 (Account, Security, Privacy, Household access, Notifications, Membership, system states).
 * Per-route grades from recorded evidence (docs/qa/batch-8-account.md): batch8-account e2e (23), web
 * tests, isolated preview QA fa RTL + en LTR at 1440/1024/768/430/390/360 (no overflow, no stuck
 * skeleton) and axe WCAG 2.1 A/AA with 0 violations on the eight canonical account pages.
 */
const BATCH8_GRADES = {
  "/:locale/profile": ["A", "A"],
  "/:locale/profile/personal": ["A", "A"],
  "/:locale/profile/household": ["A", "A"],
  "/:locale/profile/membership": ["A", "A"],
  "/:locale/subscription": ["A", "A"],
  "/:locale/profile/notifications": ["A", "A"],
  "/:locale/notifications/preferences": ["A", "A"],
  "/:locale/profile/security": ["A", "A"],
  "/:locale/profile/privacy": ["A", "A"],
  "/:locale/profile/activity": ["A", "A"],
  "/:locale/invitations/:token": ["A", "B"],
  "/:locale/profile/household/pets/:petId/access": ["B", "B"],
  "/:locale/profile/household/pets/:petId/lifecycle": ["B", "C"],
  "/:locale/subscription/plans": ["B", "B"],
  "/:locale/:...rest": ["A", "A"],
};
const BATCH8_BLOCKERS =
  "Batch 8: batch8-account e2e (profile/contact verification, pre-takeover guard, OTP single use, household roles/removal/last owner, invitation states, temporary/expired/revoked grants, sessions/revoke-all, security notices, reset-link single use, consents, sharing, export build/download/expiry, deletion re-auth/blockers/cancel, honoured notification prefs, owner-only membership, activity, IDOR/CSRF/returnTo) + web tests green; preview QA fa/en at six widths and axe clean. Live: OTP/SMS/email delivery and payments are sandbox (BLOCKED_EXTERNAL); deletion processing waits for a published retention policy; no pet-transfer flow.";
/**
 * Batch 6 (Lost Pet, Animal Support, Donations, NGO/Shelter, Community, Trust & Safety, admin console).
 * Evidence (docs/qa/batch-6-animal-support.md): batch6-animal-support e2e (35) + web tests; isolated preview
 * with seed-batch6. Visual A = fa at 1440/1024/768/430/390/360 AND en checked (no overflow, no stuck
 * skeleton, axe WCAG 2.1 A/AA clean at 1440/390). Visual B = fa+en at 1440/390 only, or fa only.
 * Routes with no browser evidence this batch keep B/C.
 */
const BATCH6_GRADES = {
  "/:locale/lost-pets/:incidentId": ["A", "A"],
  "/:locale/animal-support/needs": ["A", "A"],
  "/:locale/animal-support/needs/:listingId": ["A", "A"],
  "/:locale/animal-support/organizations/:organizationId": ["A", "A"],
  "/:locale/community": ["A", "A"],
  "/:locale/admin/community": ["A", "A"],
  "/:locale/lost-pets": ["A", "B"],
  "/:locale/pets/:id/lost/report": ["A", "B"],
  "/:locale/pets/:id/lost/:incidentId": ["A", "B"],
  "/:locale/animal-support/needs/new": ["A", "B"],
  "/:locale/animal-support/needs/:listingId/manage": ["A", "B"],
  "/:locale/animal-support/needs/mine": ["A", "B"],
  "/:locale/animal-support/my-help": ["A", "B"],
  "/:locale/animal-support/campaigns": ["B", "B"],
  "/:locale/animal-support/campaigns/:campaignId": ["A", "B"],
  "/:locale/donations/:id": ["A", "B"],
  "/:locale/community/posts/:postId": ["A", "B"],
  "/:locale/community/new": ["A", "B"],
  "/:locale/ngo": ["A", "B"],
  "/:locale/ngo/needs": ["A", "B"],
  "/:locale/ngo/offers": ["A", "B"],
  "/:locale/ngo/donations": ["A", "B"],
  "/:locale/ngo/team": ["A", "B"],
  "/:locale/ngo/verification": ["A", "B"],
  "/:locale/admin/animal-support": ["A", "B"],
  "/:locale/admin/animal-support/needs": ["A", "B"],
  "/:locale/admin/animal-support/needs/:id": ["A", "B"],
  "/:locale/admin/animal-support/organizations": ["A", "B"],
  "/:locale/admin/animal-support/organizations/:id": ["A", "B"],
  "/:locale/admin/animal-support/donations": ["A", "B"],
  "/:locale/admin/lost-pets": ["A", "B"],
  "/:locale/admin/lost-pets/:id": ["A", "B"],
  "/:locale/admin/trust/:id": ["A", "B"],
};
const BATCH6_BLOCKERS =
  "Batch 6: batch6-animal-support e2e (location/contact privacy, lost-pet lifecycle, offers and fulfilment, expiry, donations incl. ledger/idempotency/refund, NGO roles and isolation, community privacy and reports, trust & safety effects and restore, admin console, forged-id sweep, deep links) + web tests; isolated preview QA with seed-batch6 (fa/en, axe clean). Live: payments sandbox only (BLOCKED_EXTERNAL); SMS delivery not configured; no map provider (approximate area text).";

function batch8Grade(route) {
  if (BATCH6_GRADES[route]) return BATCH6_GRADES[route];
  return BATCH8_GRADES[route];
}

function status(route, pageDomain, hasTest) {
  if (pageDomain === "AI" || pageDomain === "CRM" || pageDomain === "Customer Affairs") return "C";
  if (pageDomain === "Checkout") return "E";
  if (pageDomain === "Auth" && /\/(forgot|reset)$/.test(route)) return "E";
  if (pageDomain === "Landing") return "A";
  if (["Services", "Vet"].includes(pageDomain)) return "B";
  return hasTest ? "B" : "B";
}

function visualStatus(route, pageDomain) {
  if (pageDomain === "AI") return "D";
  if (["CRM", "Customer Affairs", "Admin Overview", "Admin Partners", "Admin Finance", "Admin Subscription", "Admin Support / Trust", "Logs / Audit"].includes(pageDomain)) return "C";
  if (["Landing", "Commerce"].includes(pageDomain)) return "B";
  return "C";
}

function referenceAvailable(pageDomain) {
  return !["AI", "CRM", "Customer Affairs"].includes(pageDomain) ? "yes" : "no / indirect";
}

function hasDynamicId(route) {
  return route.split("/").some((segment) => segment.startsWith(":") && segment !== ":locale");
}

function missingFunctionality(route, pageDomain) {
  if (pageDomain === "AI") return "Placeholder only; no production assistant workflow or backend";
  if (pageDomain === "CRM" || pageDomain === "Customer Affairs") return "Sample-only data; actions are not persisted and no domain API is connected";
  if (pageDomain === "Checkout") return "Live payment/BNPL adapters are not implemented; only simulated flow is proven";
  if (pageDomain === "Auth" && /\/(forgot|reset)$/.test(route)) return "Reset token is not delivered by a production email/SMS provider";
  if (pageDomain === "Auth") return "Production OTP/email and OAuth credentials/integration acceptance remain";
  if (pageDomain === "Services" || pageDomain === "Vet") return "Pet-scoped compatibility authorization must be fixed; vet-only filtering is not enforced in provider search";
  if (pageDomain === "Seller OS" && route.includes("/channels")) return "Torob/Digikala production connectors are unimplemented";
  if (pageDomain === "Notifications") return "Production SMS/email/push delivery and scheduled care triggers are incomplete";
  if (pageDomain === "Subscription") return "Production billing, renewal, cancellation and shipment integration need end-to-end acceptance";
  if (hasDynamicId(route)) return "Dynamic ID, not-found, authorization and mutation path need route-level end-to-end acceptance";
  if (pageDomain === "Landing") return "No blocking function gap observed; route links still depend on unfinished destinations";
  return "Primary UI exists, but all actions and domain transitions are not accepted end to end";
}

function missingStates(route, pageDomain) {
  const base = "Desktop/mobile and Persian/English acceptance is incomplete";
  if (pageDomain === "Landing") return "Reduced-motion, low-height and slower-device checks remain";
  if (hasDynamicId(route)) return `${base}; loading, empty, error, not-found and forbidden states not all verified`;
  if (["CRM", "Customer Affairs"].includes(pageDomain)) return `${base}; real loading/empty/error/permission states do not exist`;
  return `${base}; loading, empty, error and permission states not all verified`;
}

function counterpart(pageDomain, kind) {
  const admin = {
    Profile: "Admin customer 360 exists",
    "Pets / Pet Profile": "Admin customer 360 only; no pet operations workspace",
    Subscription: "Admin subscription exists",
    Booking: "No dedicated admin booking operations page",
    Vet: "Provider list exists; no partner detail/verification page",
    Services: "No admin services catalog page",
    Commerce: "No admin product/catalog operations page",
    Cart: "N/A",
    Checkout: "Finance/reconciliation only; no checkout incident workspace",
    Orders: "No admin order operations page",
    "Pet Travel": "No admin travel operations page",
    Insurance: "No admin insurance page",
    Places: "No admin places page",
    "Animal Support": "No admin animal-support page",
    Community: "No admin community moderation page",
    Notifications: "No admin notification operations page",
    Support: "Admin support exists",
    Blog: "Admin CMS exists",
    "Lost Pet": "No admin lost-pet operations page",
  };
  const partner = {
    Booking: "Provider bookings exists",
    Vet: "Provider OS exists",
    Services: "Provider services exists",
    Commerce: "Seller OS exists",
    Checkout: "Seller order/finance exists",
    Orders: "Seller orders exists",
    "Pet Travel": "Missing travel partner portal",
    Insurance: "Missing insurer portal",
    "Animal Support": "Missing shelter/NGO portal",
    Support: "Missing provider/seller support view",
  };
  return (kind === "admin" ? admin : partner)[pageDomain] || "N/A";
}

function priority(route, pageDomain) {
  if (pageDomain === "Checkout" || (pageDomain === "Auth" && /\/(forgot|reset)$/.test(route)) || ["Services", "Vet"].includes(pageDomain)) return "P0";
  if (["AI", "CRM", "Customer Affairs", "Subscription", "Notifications"].includes(pageDomain)) return "P1";
  if (pageDomain.startsWith("Admin") || ["Provider OS", "Seller OS", "Health", "Documents", "Booking", "Orders", "Pet Travel", "Insurance", "Animal Support"].includes(pageDomain)) return "P1";
  if (pageDomain === "Landing") return "P3";
  return "P2";
}

function effort(route, pageDomain) {
  if (["CRM", "Customer Affairs", "AI", "Checkout"].includes(pageDomain)) return "L";
  if (hasDynamicId(route)) return "M";
  if (pageDomain.startsWith("Admin") || ["Provider OS", "Seller OS", "Health", "Documents", "Subscription"].includes(pageDomain)) return "M";
  return "S";
}

function blockers(route, pageDomain) {
  if (pageDomain === "Checkout") return "Merchant, BNPL and shipping production credentials/contracts";
  if (pageDomain === "Auth") return "SMS/email/OAuth provider credentials and production callback configuration";
  if (pageDomain === "Seller OS" && route.includes("/channels")) return "Official marketplace partner APIs and credentials";
  if (pageDomain === "Notifications") return "SMS/email/push provider credentials";
  if (["CRM", "Customer Affairs", "AI"].includes(pageDomain)) return "Missing backend/domain implementation";
  if (hasDynamicId(route)) return "Deterministic seeded IDs and role-scoped test fixtures";
  return "Route-level design and QA acceptance";
}

const testFiles = new Set(
  walk(path.join(root, "apps/web"))
    .filter((file) => /\.(test|spec)\.tsx?$/.test(file))
    .map((file) => file.toLowerCase()),
);

const rows = walk(appRoot)
  .filter((file) => file.endsWith(`${path.sep}page.tsx`))
  .map((file) => {
    const route = toRoute(file);
    const routeActor = actor(route);
    const pageDomain = domain(route);
    const source = fs.readFileSync(file, "utf8");
    const component = [...source.matchAll(/import\s+\{?\s*([A-Z][A-Za-z0-9]+(?:View|Page|Wizard|Shell))\s*\}?\s+from/g)][0]?.[1];
    const pageName = component || route.split("/").filter(Boolean).at(-1)?.replace(/^:/, "") || "Landing";
    const hasTest = [...testFiles].some((testFile) => testFile.includes(pageName.toLowerCase().replace(/view$/, "")));
    return {
      route,
      pageName,
      actor: routeActor,
      domain: pageDomain,
      authRequirement: authRequirement(route, routeActor),
      designReference: referenceAvailable(pageDomain),
      functionStatus: batch8Grade(route) ? batch8Grade(route)[0] : isBatch4(route) ? BATCH4_GRADE.function : isBatch3(route) ? BATCH3_GRADE.function : isBatch2(route) ? BATCH2_GRADE.function : status(route, pageDomain, hasTest),
      visualStatus: batch8Grade(route) ? batch8Grade(route)[1] : isBatch4(route) ? BATCH4_GRADE.visual : isBatch3(route) ? BATCH3_GRADE.visual : isBatch2(route) ? BATCH2_GRADE.visual : visualStatus(route, pageDomain),
      backendApiDependency: apiDependency(pageDomain),
      missingFunctionality: missingFunctionality(route, pageDomain),
      missingStates: missingStates(route, pageDomain),
      adminCounterpart: counterpart(pageDomain, "admin"),
      partnerCounterpart: counterpart(pageDomain, "partner"),
      priority: priority(route, pageDomain),
      estimatedEffort: effort(route, pageDomain),
      blockers: BATCH6_GRADES[route] ? BATCH6_BLOCKERS : batch8Grade(route) ? BATCH8_BLOCKERS : isBatch4(route) ? BATCH4_GRADE.blockers : isBatch3(route) ? BATCH3_GRADE.blockers : isBatch2(route) ? BATCH2_GRADE.blockers : blockers(route, pageDomain),
      sourceFile: path.relative(root, file).replaceAll(path.sep, "/"),
    };
  })
  .sort((a, b) => a.route.localeCompare(b.route));

const columns = Object.keys(rows[0]);
const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => `"${String(row[column]).replaceAll('"', '""')}"`).join(","))].join("\n");
const output = path.join(__dirname, "page-completion-registry-2026-09-25.csv");
fs.writeFileSync(output, `${csv}\n`);
fs.writeFileSync(path.join(__dirname, "page-completion-registry-2026-09-25.json"), `${JSON.stringify({ generatedAt: "2026-09-25", routeCount: rows.length, rows }, null, 2)}\n`);
console.log(`Wrote ${rows.length} routes to ${output}`);
