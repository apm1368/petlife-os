import {beforeEach,describe,expect,it,vi} from "vitest";
import {screen} from "@testing-library/react";
import {renderWithIntl} from "@/test/render-with-intl";
import {adminFinanceService} from "@/services/admin-finance.service";
import {AdminMarketplaceStatementsView} from "./AdminMarketplaceStatementsView";
const state=vi.hoisted(()=>({permissions:["sellerFinance.view"]}));
vi.mock("@/stores/admin-store",()=>({useAdminStore:(select:(s:unknown)=>unknown)=>select({context:{permissions:state.permissions}})}));
vi.mock("@/services/admin-finance.service",()=>({adminFinanceService:{listMarketplaceStatements:vi.fn(),getMarketplaceStatement:vi.fn()}}));
const statement={id:"s1",provider:"TOROB" as never,marketplaceChannelAccountId:"a1",sellerOrganizationId:"seller1",source:"CSV_IMPORT" as never,periodStart:"2026-10-01T00:00:00Z",periodEnd:"2026-10-15T00:00:00Z",currency:"IRR",totalAmount:1000000,importedByAdmin:{id:"admin1",displayName:"Admin",role:"SUPER_ADMIN" as never},createdAt:"2026-10-15T00:00:00Z",lines:[{id:"l1",externalOrderId:"EXT-001",amount:1000000,feeAmount:null,feeConfidence:"UNKNOWN" as never,description:"Imported item",createdAt:"2026-10-15T00:00:00Z"}]};
describe("AdminMarketplaceStatementsView",()=>{
 beforeEach(()=>{vi.resetAllMocks();state.permissions=["sellerFinance.view"];vi.mocked(adminFinanceService.listMarketplaceStatements).mockResolvedValue([statement]);vi.mocked(adminFinanceService.getMarketplaceStatement).mockResolvedValue(statement)});
 it("does not request financial data without permission",()=>{state.permissions=[];renderWithIntl(<AdminMarketplaceStatementsView/>);expect(screen.getByText("You do not have access to seller financial information.")).toBeTruthy();expect(adminFinanceService.listMarketplaceStatements).not.toHaveBeenCalled()});
 it("links the real statement detail and formats IRR as Toman",async()=>{renderWithIntl(<AdminMarketplaceStatementsView/>);expect(await screen.findByText("100,000 Toman")).toBeTruthy();expect(screen.getByRole("link",{name:"View details"}).getAttribute("href")).toBe("/en/admin/marketplace-statements/s1")});
 it("shows unknown fees as missing, never zero or a fabricated amount",async()=>{renderWithIntl(<AdminMarketplaceStatementsView statementId="s1"/>);await screen.findByText("EXT-001");expect(screen.getByText("Unknown")).toBeTruthy();expect(screen.getByText("Not provided")).toBeTruthy();expect(adminFinanceService.getMarketplaceStatement).toHaveBeenCalledWith("s1",expect.any(AbortSignal));expect(adminFinanceService.listMarketplaceStatements).not.toHaveBeenCalled()});
 it("distinguishes load failure from an empty statement list",async()=>{vi.mocked(adminFinanceService.listMarketplaceStatements).mockRejectedValue(new Error("offline"));renderWithIntl(<AdminMarketplaceStatementsView/>);await screen.findByRole("alert");expect(screen.queryByText("No matching statements.")).toBeNull()});
});
