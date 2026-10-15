import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { useAdminStore } from "@/stores/admin-store";
import { adminService } from "@/services/admin.service";
import { AdminDashboardView } from "./AdminDashboardView";
vi.mock("@/services/admin.service",()=>({adminService:{getDashboard:vi.fn(),getTrustQueue:vi.fn(),listTasks:vi.fn(),getSystemHealth:vi.fn()}}));
vi.mock("@/features/navigation/localized-link",()=>({default:({href,children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=><a href={href} {...props}>{children}</a>}));
describe("AdminDashboardView",()=>{
 beforeEach(()=>{vi.clearAllMocks();useAdminStore.setState({context:{isAdmin:true,displayName:"Owner",permissions:[]} as never,status:"ready"});vi.mocked(adminService.getDashboard).mockResolvedValue({openSupportCases:12,openDisputes:2,openTrustCases:3,pendingRefundApprovals:4,openTasks:5});});
 it("shows real summary counts but never requests or links forbidden queues",async()=>{renderWithIntl(<AdminDashboardView/>);await waitFor(()=>expect(screen.getByText("12")).toBeTruthy());expect(adminService.getTrustQueue).not.toHaveBeenCalled();expect(adminService.listTasks).not.toHaveBeenCalled();expect(adminService.getSystemHealth).not.toHaveBeenCalled();expect(screen.queryAllByRole("link")).toHaveLength(0);});
 it("distinguishes a queue request failure from an empty queue",async()=>{useAdminStore.setState({context:{isAdmin:true,permissions:["trust.view"]} as never});vi.mocked(adminService.getTrustQueue).mockRejectedValue(new Error("offline"));renderWithIntl(<AdminDashboardView/>);expect(await screen.findByRole("alert")).toBeTruthy();expect(screen.queryByText("Nothing needs attention here.")).toBeNull();});
});
