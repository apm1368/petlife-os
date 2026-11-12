import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { useAdminStore } from "@/stores/admin-store";
import { adminService } from "@/services/admin.service";
import { ApiError } from "@/lib/api/client";
import { AdminDashboardView } from "./AdminDashboardView";
import { resetQueues } from "./admin-queues";
import de from "@/messages/de.json";
import es from "@/messages/es.json";
import en from "@/messages/en.json";
vi.mock("@/services/admin.service",()=>({adminService:{getDashboard:vi.fn(),getTrustQueue:vi.fn(),listTasks:vi.fn(),getSystemHealth:vi.fn()}}));
vi.mock("@/features/navigation/localized-link",()=>({default:({href,children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=><a href={href} {...props}>{children}</a>}));
describe("AdminDashboardView",()=>{
 const leafKeys = (value: unknown, prefix = ""): string[] => {
   if (!value || typeof value !== "object") return [prefix];
   return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key));
 };
 beforeEach(()=>{vi.clearAllMocks();resetQueues();useAdminStore.setState({context:{isAdmin:true,displayName:"Owner",permissions:[]} as never,status:"ready"});vi.mocked(adminService.getDashboard).mockResolvedValue({openSupportCases:12,openDisputes:2,openTrustCases:3,pendingRefundApprovals:4,openTasks:5} as never);});
 afterEach(()=>vi.unstubAllGlobals());
 it("never renders counts, requests or links forbidden queues",async()=>{renderWithIntl(<AdminDashboardView/>);await screen.findByText("Owner");expect(screen.queryByText("12")).toBeNull();expect(adminService.getTrustQueue).not.toHaveBeenCalled();expect(adminService.listTasks).not.toHaveBeenCalled();expect(adminService.getSystemHealth).not.toHaveBeenCalled();expect(screen.queryAllByRole("link")).toHaveLength(0);});
 it("renders an allowed count and hides withheld counts rather than treating them as zero",async()=>{useAdminStore.setState({context:{isAdmin:true,permissions:["support.view","finance.view"]} as never});vi.mocked(adminService.getDashboard).mockResolvedValue({openSupportCases:12,openDisputes:null,openTrustCases:null,pendingRefundApprovals:null,openTasks:null} as never);renderWithIntl(<AdminDashboardView/>);await waitFor(()=>expect(screen.getByText("12")).toBeTruthy());expect(screen.queryByText("0")).toBeNull();expect(screen.queryByRole("link",{name:/refund/i})).toBeNull();});
 it("distinguishes a queue request failure from an empty queue",async()=>{useAdminStore.setState({context:{isAdmin:true,permissions:["trust.view"]} as never});vi.mocked(adminService.getTrustQueue).mockRejectedValue(new Error("offline"));renderWithIntl(<AdminDashboardView/>);expect(await screen.findByRole("alert")).toBeTruthy();expect(screen.queryByText("Nothing needs attention here.")).toBeNull();});

 it.each([
   ["fa", "اتصال اینترنت برقرار نیست. اتصال را بررسی کنید و دوباره تلاش کنید."],
   ["en", "You are offline. Check your connection and try again."],
   ["de", "Du bist offline. Prüfe deine Verbindung und versuche es erneut."],
   ["es", "No tienes conexión a Internet. Comprueba tu conexión e inténtalo de nuevo."],
 ] as const)("renders the dashboard offline state in %s", async (locale, message) => {
   vi.stubGlobal("navigator", { onLine: false });
   vi.mocked(adminService.getDashboard).mockRejectedValueOnce(new TypeError("Failed to fetch"));
   renderWithIntl(<AdminDashboardView />, locale);
   expect((await screen.findByRole("alert")).textContent).toContain(message);
   if (locale !== "fa") expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]/);
 });

 it.each([
   ["fa", "اطلاعات داشبورد در حال بارگذاری است…"],
   ["en", "Loading dashboard information…"],
   ["de", "Dashboard-Daten werden geladen …"],
   ["es", "Cargando la información del panel…"],
 ] as const)("labels the dashboard loading skeleton in %s", (locale, label) => {
   vi.mocked(adminService.getDashboard).mockReturnValueOnce(new Promise(() => undefined));
   renderWithIntl(<AdminDashboardView />, locale);
   expect(screen.getByLabelText(label)).toBeTruthy();
   if (locale !== "fa") expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]/);
 });

 it.each([
   ["fa", "موردی در انتظار نیست."],
   ["en", "Nothing waiting here."],
   ["de", "Es gibt nichts zu bearbeiten."],
   ["es", "No hay nada pendiente."],
 ] as const)("renders the empty operational queue in %s", async (locale, message) => {
   useAdminStore.setState({context:{isAdmin:true,permissions:["trust.view"]} as never});
   vi.mocked(adminService.getTrustQueue).mockResolvedValueOnce({items:[],total:0,page:1,pageSize:8});
   renderWithIntl(<AdminDashboardView />, locale);
   expect(await screen.findByText(message)).toBeTruthy();
   if (locale !== "fa") expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]/);
 });

 it.each([
   ["fa", "این بخش بارگذاری نشد."],
   ["en", "This section could not be loaded."],
   ["de", "Dieser Bereich konnte nicht geladen werden."],
   ["es", "No se pudo cargar esta sección."],
 ] as const)("renders a translated dashboard request error in %s", async (locale, message) => {
   vi.mocked(adminService.getDashboard).mockRejectedValueOnce(new Error("server error"));
   renderWithIntl(<AdminDashboardView />, locale);
   expect((await screen.findByRole("alert")).textContent).toContain(message);
   if (locale !== "fa") expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]/);
 });

 it.each([
   ["fa", "اجازهٔ مشاهدهٔ این داشبورد را ندارید. با مدیر سامانه تماس بگیرید."],
   ["en", "You don't have permission to view this dashboard. Contact your administrator."],
   ["de", "Du hast keine Berechtigung, dieses Dashboard aufzurufen. Wende dich an die Administration."],
   ["es", "No tienes permiso para ver este panel. Contacta con la administración."],
 ] as const)("renders the dashboard access-denied state in %s", async (locale, message) => {
   vi.mocked(adminService.getDashboard).mockRejectedValueOnce(new ApiError({ code: "FORBIDDEN", message: "Forbidden", requestId: "test" }, 403));
   renderWithIntl(<AdminDashboardView />, locale);
   expect((await screen.findByRole("alert")).textContent).toContain(message);
   expect(screen.queryByRole("button", { name: /retry|erneut versuchen|reintentar|تلاش دوباره/i })).toBeNull();
   if (locale !== "fa") expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]/);
 });

 it.each([["de", de.rollout.admin, de.rollout.adminSearch], ["es", es.rollout.admin, es.rollout.adminSearch]] as const)("defines explicit full dashboard and search copy in %s (no English or Persian catalog fallback)", (_locale, dashboard, search) => {
   expect(leafKeys(dashboard).sort()).toEqual(leafKeys(en.rollout.admin).sort());
   expect(leafKeys(search).sort()).toEqual(leafKeys(en.rollout.adminSearch).sort());
   expect(JSON.stringify([dashboard, search])).not.toMatch(/Your operations|Nothing waiting|Search customers|نبض کارها|تلاش دوباره/);
 });

 it.each([["de", "Dashboard", "Fälle zu Vertrauen und Sicherheit", "Betriebsbereit", "Datenbank", /Fällig am 13\./], ["es", "Panel de control", "Casos de confianza y seguridad", "Operativo", "Base de datos", /Vence el 13 nov/]] as const)("renders dashboard cards, queue and system data in %s", async (locale, title, trustLabel, healthy, database, dueDate) => {
   useAdminStore.setState({context:{isAdmin:true,displayName:"Admin",permissions:["support.view","trust.view","task.manage","system.view"]} as never});
   vi.mocked(adminService.getTrustQueue).mockResolvedValue({items:[{key:"trust-1",kind:"TRUST_CASE",severity:"HIGH",reasons:[],trustCaseId:"case-1"}]} as never);
   vi.mocked(adminService.listTasks).mockResolvedValue({items:[{id:"task-1",title:"Review submitted case",dueAt:"2026-11-13T08:00:00.000Z"}]} as never);
   vi.mocked(adminService.getSystemHealth).mockResolvedValue({status:"HEALTHY",checkedAt:"2026-11-13T08:00:00.000Z",components:{database:{status:"UP"}}} as never);
   renderWithIntl(<AdminDashboardView/>, locale);
   expect(await screen.findByRole("heading", {name:title})).toBeTruthy();
   expect(await screen.findByText(trustLabel)).toBeTruthy();
   expect(await screen.findByText(healthy)).toBeTruthy();
   expect(screen.getByText(database)).toBeTruthy();
   expect(screen.getByText(dueDate)).toBeTruthy();
   expect(document.body.textContent).not.toMatch(/نبض کارها|صف اعتماد و امنیت|تلاش دوباره/);
 });
 it("orders the attention board by consequence, hides withheld queues and lists cleared ones", async () => {
   useAdminStore.setState({context:{isAdmin:true,displayName:"Owner",permissions:["support.view","trust.view","commerce.view","dispute.view"]} as never});
   vi.mocked(adminService.getTrustQueue).mockResolvedValue({items:[],total:0,page:1,pageSize:6} as never);
   vi.mocked(adminService.getDashboard).mockResolvedValue({openSupportCases:4,openDisputes:0,openTrustCases:2,pendingRefundApprovals:null,openTasks:null,pendingVerifications:null,pendingRefundRequests:1,pendingOfferModeration:0,pendingCatalogRequests:0,pendingTravelListings:null,pendingSupportNeeds:0,openCommunityReports:3,pendingMemorials:0,openPlaceReports:null} as never);
   renderWithIntl(<AdminDashboardView/>);
   const board = await screen.findByRole("heading", { name: "Needs your attention" });
   const card = board.closest("section")!;
   expect(card.textContent).toContain("10 items waiting across 4 queues");
   const links = Array.from(card.querySelectorAll("a")).map((a) => a.getAttribute("href"));
   expect(links).toEqual(["/admin/trust", "/admin/support", "/admin/commerce/refund-requests", "/admin/community"]);
   expect(card.textContent).toContain("Clear: Open disputes, Offers to moderate, Catalog requests, Help requests to review, Memorials to review");
   expect(card.textContent).not.toContain("Refund approvals");
 });
});

