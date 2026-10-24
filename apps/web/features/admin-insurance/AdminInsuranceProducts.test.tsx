import {beforeEach,describe,expect,it,vi} from "vitest";
import {screen} from "@testing-library/react";
import {renderWithIntl} from "@/test/render-with-intl";
import {adminInsuranceService} from "@/services/admin-insurance.service";
import {AdminInsuranceProducts} from "./AdminInsuranceProducts";
const state=vi.hoisted(()=>({permissions:["insurance.view"]}));
vi.mock("@/stores/admin-store",()=>({useAdminStore:(select:(s:unknown)=>unknown)=>select({context:{permissions:state.permissions}})}));
vi.mock("@/services/admin-insurance.service",()=>({adminInsuranceService:{provider:vi.fn(),products:vi.fn()}}));
describe("AdminInsuranceProducts",()=>{
 beforeEach(()=>{vi.resetAllMocks();state.permissions=["insurance.view"];vi.mocked(adminInsuranceService.provider).mockResolvedValue({id:"i1",name:"Insurer",country:"IR"} as never);vi.mocked(adminInsuranceService.products).mockResolvedValue({items:[{id:"p1",name:"Insurance Plan",coverageSummary:"Coverage summary from server",exclusions:["Pre-existing illness"],status:"VERIFIED",isPubliclyListed:true,premiumMinIrr:1000000}],total:1,page:1,pageSize:20} as never)});
 it("shows exclusions and prices without exposing management to read-only admins",async()=>{renderWithIntl(<AdminInsuranceProducts providerId="i1"/>);await screen.findByText("Pre-existing illness");expect(screen.getByText("Recorded minimum premium: 100,000 Toman")).toBeTruthy();expect(screen.queryByRole("button",{name:"Edit insurance product"})).toBeNull();expect(screen.queryByRole("button",{name:"Create insurance product"})).toBeNull()});
 it("never loads the catalog without insurance.view",()=>{state.permissions=[];renderWithIntl(<AdminInsuranceProducts providerId="i1"/>);expect(adminInsuranceService.products).not.toHaveBeenCalled();expect(screen.getByText("You do not have access to insurance products.")).toBeTruthy()});
});
