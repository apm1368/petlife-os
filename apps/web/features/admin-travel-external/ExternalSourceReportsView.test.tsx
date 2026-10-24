import {beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,screen,waitFor} from "@testing-library/react";
import {renderWithIntl} from "@/test/render-with-intl";
import {externalSourceReportsService} from "@/services/external-source-reports.service";
import {ExternalSourceReportsView} from "./ExternalSourceReportsView";
const state=vi.hoisted(()=>({permissions:["travel.source.view"]}));
vi.mock("@/stores/admin-store",()=>({useAdminStore:(select:(s:unknown)=>unknown)=>select({context:{permissions:state.permissions}})}));
vi.mock("@/services/admin-travel-external.service",()=>({adminTravelExternalService:{sources:vi.fn().mockResolvedValue([])}}));
vi.mock("@/services/external-source-reports.service",()=>({externalSourceReportsService:{metrics:vi.fn(),parser:vi.fn(),errors:vi.fn(),evidence:vi.fn(),tasks:vi.fn(),diff:vi.fn()}}));
describe("ExternalSourceReportsView",()=>{
 beforeEach(()=>{vi.clearAllMocks();state.permissions=["travel.source.view"];vi.mocked(externalSourceReportsService.metrics).mockResolvedValue([{code:"source1",status:"ACTIVE",listings:0,newLast24h:0,changesLast24h:0,petPolicy:{confirmedAllowed:0,confirmedNotAllowed:0,ambiguous:0,unknown:0,petQualifiedPercent:null,unknownPercent:null},priceCoveragePercent:null,priceFreshness:{FRESH:0,AGING:0,STALE:0},runsLast7d:0,errorRatePercent:null,blockRatePercent:null}])});
 it("keeps missing coverage and error rates unknown instead of zero percent",async()=>{renderWithIntl(<ExternalSourceReportsView/>);await screen.findByText("source1");expect(screen.getAllByText("Unknown")).toHaveLength(5);expect(screen.queryByText("0%")).toBeNull()});
 it("distinguishes a failed report from an empty report and can retry",async()=>{vi.mocked(externalSourceReportsService.errors).mockRejectedValueOnce(Error("network")).mockResolvedValueOnce({items:[],total:0,page:1,pageSize:20});renderWithIntl(<ExternalSourceReportsView/>);await screen.findByText("source1");fireEvent.click(screen.getByRole("button",{name:"Errors"}));await screen.findByRole("alert");expect(screen.queryByText("No items for this selection.")).toBeNull();fireEvent.click(screen.getByRole("button",{name:"Retry"}));await screen.findByText("No items for this selection.");expect(externalSourceReportsService.errors).toHaveBeenCalledTimes(2)});
 it("applies unreviewed policy filter and requests evidence only when selected",async()=>{vi.mocked(externalSourceReportsService.evidence).mockResolvedValue({items:[],total:0,page:1,pageSize:20});renderWithIntl(<ExternalSourceReportsView/>);await screen.findByText("source1");expect(externalSourceReportsService.evidence).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Pet evidence"}));await screen.findByText("No items for this selection.");fireEvent.click(screen.getByLabelText("Only stays without an admin decision"));await waitFor(()=>{const call=vi.mocked(externalSourceReportsService.evidence).mock.calls.at(-1)!;expect(call[0].get("unreviewedOnly")).toBe("true")})});
 it("makes no report requests when view permission is absent",()=>{state.permissions=[];renderWithIntl(<ExternalSourceReportsView/>);expect(externalSourceReportsService.metrics).not.toHaveBeenCalled()});
});
