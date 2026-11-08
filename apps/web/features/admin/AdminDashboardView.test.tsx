import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { useAdminStore } from "@/stores/admin-store";
import { adminService } from "@/services/admin.service";
import { AdminDashboardView } from "./AdminDashboardView";
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
 beforeEach(()=>{vi.clearAllMocks();useAdminStore.setState({context:{isAdmin:true,displayName:"Owner",permissions:[]} as never,status:"ready"});vi.mocked(adminService.getDashboard).mockResolvedValue({openSupportCases:12,openDisputes:2,openTrustCases:3,pendingRefundApprovals:4,openTasks:5});});
 it("never renders counts, requests or links forbidden queues",async()=>{renderWithIntl(<AdminDashboardView/>);await screen.findByText("Owner");expect(screen.queryByText("12")).toBeNull();expect(adminService.getTrustQueue).not.toHaveBeenCalled();expect(adminService.listTasks).not.toHaveBeenCalled();expect(adminService.getSystemHealth).not.toHaveBeenCalled();expect(screen.queryAllByRole("link")).toHaveLength(0);});
 it("renders an allowed count and hides withheld counts rather than treating them as zero",async()=>{useAdminStore.setState({context:{isAdmin:true,permissions:["support.view","finance.view"]} as never});vi.mocked(adminService.getDashboard).mockResolvedValue({openSupportCases:12,openDisputes:null,openTrustCases:null,pendingRefundApprovals:null,openTasks:null});renderWithIntl(<AdminDashboardView/>);await waitFor(()=>expect(screen.getByText("12")).toBeTruthy());expect(screen.queryByText("0")).toBeNull();expect(screen.queryByRole("link",{name:/refund/i})).toBeNull();});
 it("distinguishes a queue request failure from an empty queue",async()=>{useAdminStore.setState({context:{isAdmin:true,permissions:["trust.view"]} as never});vi.mocked(adminService.getTrustQueue).mockRejectedValue(new Error("offline"));renderWithIntl(<AdminDashboardView/>);expect(await screen.findByRole("alert")).toBeTruthy();expect(screen.queryByText("Nothing needs attention here.")).toBeNull();});

 it.each([["de", de.rollout.admin, de.rollout.adminSearch], ["es", es.rollout.admin, es.rollout.adminSearch]] as const)("defines explicit full dashboard and search copy in %s (no English or Persian catalog fallback)", (_locale, dashboard, search) => {
   expect(leafKeys(dashboard).sort()).toEqual(leafKeys(en.rollout.admin).sort());
   expect(leafKeys(search).sort()).toEqual(leafKeys(en.rollout.adminSearch).sort());
   expect(JSON.stringify([dashboard, search])).not.toMatch(/Your operations|Nothing waiting|Search customers|نبض کارها|تلاش دوباره/);
 });

 it.each([["de", "Ihr Arbeitsüberblick", "Fälle zu Vertrauen und Sicherheit", "Betriebsbereit", "Datenbank", /Fällig am 13\./], ["es", "Resumen de operaciones", "Casos de confianza y seguridad", "Operativo", "Base de datos", /Vence el 13 nov/]] as const)("renders dashboard cards, queue and system data in %s", async (locale, title, trustLabel, healthy, database, dueDate) => {
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
});
