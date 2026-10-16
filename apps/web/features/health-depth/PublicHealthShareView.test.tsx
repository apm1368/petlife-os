import {beforeEach,describe,expect,it,vi} from "vitest";
import {screen} from "@testing-library/react";
import {renderWithIntl} from "@/test/render-with-intl";
import {healthDepthService} from "@/services/health-depth.service";
import {PublicHealthShareView} from "./PublicHealthShareView";
import {ApiError} from "@/lib/api/client";
vi.mock("@/services/health-depth.service",()=>({healthDepthService:{publicShare:vi.fn()}}));
const data={label:"Emergency handoff",expiresAt:"2026-10-20T10:00:00Z",pet:{name:"Pet One",species:"DOG",breed:null,sex:"UNKNOWN",birthDate:null,approximateAgeMonths:null},allergies:[],labs:[],visits:[],imaging:[]};
describe("PublicHealthShareView",()=>{
 beforeEach(()=>vi.resetAllMocks());
 it("shows only sections actually returned by the authorized public endpoint",async()=>{vi.mocked(healthDepthService.publicShare).mockResolvedValue(data);renderWithIntl(<PublicHealthShareView token="controlled-token"/>);await screen.findByText("Pet One");expect(screen.getByRole("heading",{name:"Allergies"})).toBeTruthy();expect(screen.queryByRole("heading",{name:"Medications"})).toBeNull();expect(screen.queryByRole("heading",{name:"Conditions"})).toBeNull()});
 it("uses the same unavailable state for unknown, expired or revoked links",async()=>{vi.mocked(healthDepthService.publicShare).mockRejectedValue(new ApiError({code:"NOT_FOUND",message:"Not found",requestId:"test"},404));renderWithIntl(<PublicHealthShareView token="controlled-token"/>);expect((await screen.findByRole("alert")).textContent).toContain("This link is unavailable");expect(screen.queryByRole("button",{name:"Retry"})).toBeNull()});
 it("offers retry for a transport failure without claiming expiry",async()=>{vi.mocked(healthDepthService.publicShare).mockRejectedValue(new Error("offline"));renderWithIntl(<PublicHealthShareView token="controlled-token"/>);await screen.findByRole("button",{name:"Retry"});expect(screen.queryByText("This link is unavailable. It may have expired or been revoked.")).toBeNull()});
});
