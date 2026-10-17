import {describe,expect,it,vi,beforeEach} from "vitest";
import {fireEvent,screen} from "@testing-library/react";
import {renderWithIntl} from "@/test/render-with-intl";
import {accountService} from "@/services/account.service";
import {ConsentHistory} from "./ConsentHistory";
vi.mock("@/services/account.service",()=>({accountService:{consentHistory:vi.fn()}}));
describe("ConsentHistory",()=>{
 beforeEach(()=>vi.resetAllMocks());
 it("loads only on demand and distinguishes legacy state from event history",async()=>{vi.mocked(accountService.consentHistory).mockResolvedValue({currentVersion:"v2",items:[{kind:"MARKETING",version:"v1",acceptedAt:null,withdrawnAt:"2026-10-01T10:00:00Z",source:"LEGACY_RECORD"}]});renderWithIntl(<ConsentHistory/>);expect(accountService.consentHistory).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Show history"}));await screen.findByText("Marketing messages");expect(screen.getByText("Older stored state; full event history is unavailable.")).toBeTruthy();expect(screen.getByText(/Withdrawn on/)).toBeTruthy()});
 it("shows a recoverable error instead of an empty history",async()=>{vi.mocked(accountService.consentHistory).mockRejectedValueOnce(Error("network")).mockResolvedValueOnce({currentVersion:"v2",items:[]});renderWithIntl(<ConsentHistory/>);fireEvent.click(screen.getByRole("button",{name:"Show history"}));await screen.findByRole("alert");expect(screen.queryByText("No consent recorded.")).toBeNull();fireEvent.click(screen.getByRole("button",{name:"Retry"}));await screen.findByText("No consent recorded.")});
});
