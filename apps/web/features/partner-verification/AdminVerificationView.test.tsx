import {beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,screen,within,waitFor} from "@testing-library/react";
import {renderWithIntl} from "@/test/render-with-intl";
import {partnerVerificationService} from "@/services/partner-verification.service";
import {verificationDetail,verificationDocument} from "@/test/fixtures/partner-verification";
import {AdminVerificationView} from "./AdminVerificationView";
const state=vi.hoisted(()=>({permissions:["verification.manage"]}));
vi.mock("@/stores/admin-store",()=>({useAdminStore:(select:(s:unknown)=>unknown)=>select({context:{permissions:state.permissions}})}));
vi.mock("@/services/partner-verification.service",async original=>{const actual=await original<typeof import("@/services/partner-verification.service")>();return {...actual,partnerVerificationService:{queue:vi.fn(),detail:vi.fn(),review:vi.fn(),transition:vi.fn(),download:vi.fn()}}});
describe("AdminVerificationView",()=>{
 it("does not offer approval when documents pass but mobile proof is missing",async()=>{
  vi.mocked(partnerVerificationService.detail).mockResolvedValue({...verificationDetail,documents:[{...verificationDocument,status:"ACCEPTED"}],allowedTransitions:["VERIFIED"],policy:{...verificationDetail.policy!,missingForApproval:[],missingProfileFields:["mobileVerifiedAt"]}});
  renderWithIntl(<AdminVerificationView subject="PROVIDER" id="org1"/>);
  await screen.findByRole("heading",{name:"Companion clinic"});
  expect(screen.queryByRole("button",{name:"Approve organization"})).toBeNull();
 });
 beforeEach(()=>{vi.resetAllMocks();state.permissions=["verification.manage"];vi.mocked(partnerVerificationService.detail).mockResolvedValue(verificationDetail)});
 it("shows Persian labels and actionable row details without exposing KYC jargon",async()=>{vi.mocked(partnerVerificationService.queue).mockResolvedValue([{subjectType:"PROVIDER",id:"org1",name:"کلینیک همراه",kind:"VET_CLINIC",status:"SUBMITTED",submittedAt:"2026-10-15T10:00:00Z",waitingHours:12,documents:{pending:1,accepted:2,rejected:0,expired:0}}]);renderWithIntl(<AdminVerificationView/>,"fa");await screen.findByRole("heading",{name:"کلینیک همراه"});expect(screen.getByRole("heading",{name:"بررسی هویت و مدارک همکاران"})).toBeTruthy();expect(screen.getByText("وضعیت مدارک")).toBeTruthy();expect(screen.getByText(/زمان ارسال پرونده/)).toBeTruthy();expect(screen.getByRole("link",{name:"بررسی پرونده و مدارک"}).getAttribute("href")).toBe("/fa/admin/verification/provider/org1");expect(document.body.textContent).not.toContain("KYC")});
 it("does not read a private verification case without permission",()=>{state.permissions=[];renderWithIntl(<AdminVerificationView subject="PROVIDER" id="org1"/>);expect(partnerVerificationService.detail).not.toHaveBeenCalled()});
 it("hides initial organization approval until accepted unexpired evidence exists",async()=>{renderWithIntl(<AdminVerificationView subject="PROVIDER" id="org1"/>);await screen.findByRole("heading",{name:"Companion clinic"});expect(screen.queryByRole("button",{name:"Approve organization"})).toBeNull();expect(screen.getByRole("button",{name:"Accept document"})).toBeTruthy();expect(partnerVerificationService.download).not.toHaveBeenCalled()});
 it("requires explicit document decision before organization approval becomes available",async()=>{const accepted={...verificationDocument,status:"ACCEPTED" as const};vi.mocked(partnerVerificationService.review).mockResolvedValue(accepted);vi.mocked(partnerVerificationService.detail).mockResolvedValueOnce(verificationDetail).mockResolvedValueOnce({...verificationDetail,documents:[accepted,{...accepted,id:"identity",kind:"IDENTITY"}],policy:{...verificationDetail.policy!,missingForSubmission:[],missingForApproval:[]}});renderWithIntl(<AdminVerificationView subject="PROVIDER" id="org1"/>);fireEvent.click(await screen.findByRole("button",{name:"Accept document"}));const dialog=screen.getByRole("dialog");fireEvent.change(within(dialog).getByLabelText("Review reason or notes"),{target:{value:"License checked against submitted evidence"}});fireEvent.click(within(dialog).getByRole("checkbox"));expect(partnerVerificationService.review).not.toHaveBeenCalled();fireEvent.click(within(dialog).getByRole("button",{name:"Confirm and save"}));await screen.findByRole("button",{name:"Approve organization"});expect(partnerVerificationService.review).toHaveBeenCalledWith("doc1",{decision:"ACCEPTED",note:"License checked against submitted evidence"});expect(partnerVerificationService.transition).not.toHaveBeenCalled()});
 it("requires audited reason before issuing a temporary document link",async()=>{vi.mocked(partnerVerificationService.download).mockResolvedValue({documentId:"doc1",downloadUrl:"https://example.com/private-signed-doc",expiresInSeconds:60});renderWithIntl(<AdminVerificationView subject="PROVIDER" id="org1"/>);fireEvent.click(await screen.findByRole("button",{name:"Request document access"}));const dialog=screen.getByRole("dialog");fireEvent.change(within(dialog).getByLabelText("Review reason or notes"),{target:{value:"Check professional license"}});fireEvent.click(within(dialog).getByRole("checkbox"));fireEvent.click(within(dialog).getByRole("button",{name:"Confirm and save"}));const link=await screen.findByRole("link",{name:"Open document using temporary link"});expect(link.getAttribute("href")).toBe("https://example.com/private-signed-doc");expect(link.getAttribute("referrerpolicy")).toBe("no-referrer");expect(partnerVerificationService.download).toHaveBeenCalledWith("doc1","Check professional license")});
 it("blocks reinstatement when mandatory valid evidence is missing",async()=>{vi.mocked(partnerVerificationService.detail).mockResolvedValue({...verificationDetail,status:"SUSPENDED",lifecycle:"SUSPENDED",documents:[],allowedTransitions:["VERIFIED","REJECTED"]});renderWithIntl(<AdminVerificationView subject="PROVIDER" id="org1"/>);await screen.findByRole("heading",{name:"Companion clinic"});expect(screen.queryByRole("button",{name:"Approve organization"})).toBeNull();expect(screen.getByText(/Reinstatement also requires/)).toBeTruthy()});
 it("preserves an uncertain decision note, checks only GET, and blocks repeating an already recorded review",async()=>{
  vi.mocked(partnerVerificationService.review).mockRejectedValue(new Error("Response lost after commit"));
  vi.mocked(partnerVerificationService.detail).mockResolvedValueOnce(verificationDetail).mockResolvedValue({...verificationDetail,documents:[{...verificationDocument,status:"REJECTED",reviewNote:"Unreadable licence"}]});
  renderWithIntl(<AdminVerificationView subject="PROVIDER" id="org1"/>);
  fireEvent.click(await screen.findByRole("button",{name:"Reject document"}));
  const dialog=screen.getByRole("dialog"),reason=within(dialog).getByLabelText("Review reason or notes");
  fireEvent.change(reason,{target:{value:"Unreadable licence"}});fireEvent.click(within(dialog).getByRole("checkbox"));fireEvent.click(within(dialog).getByRole("button",{name:"Confirm and save"}));
  await within(dialog).findByText(/The result of this action was not confirmed/);
  expect((reason as HTMLInputElement).value).toBe("Unreadable licence");
  expect((within(dialog).getByRole("button",{name:"Confirm and save"}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(within(dialog).getByRole("button",{name:"Reload case status"}));
  await within(dialog).findByText(/this action is no longer available/);
  expect((reason as HTMLInputElement).value).toBe("Unreadable licence");
  expect((within(dialog).getByRole("button",{name:"Confirm and save"}) as HTMLButtonElement).disabled).toBe(true);
  expect(partnerVerificationService.detail).toHaveBeenCalledTimes(2);
  expect(partnerVerificationService.review).toHaveBeenCalledTimes(1);
  expect(partnerVerificationService.transition).not.toHaveBeenCalled();
 });
 it("keeps the failed-decision draft and locks resubmission if checking the case also fails",async()=>{
  vi.mocked(partnerVerificationService.review).mockRejectedValue(new Error("Response unavailable"));
  vi.mocked(partnerVerificationService.detail).mockResolvedValueOnce(verificationDetail).mockRejectedValue(new Error("Read unavailable"));
  renderWithIntl(<AdminVerificationView subject="PROVIDER" id="org1"/>);
  fireEvent.click(await screen.findByRole("button",{name:"Reject document"}));const dialog=screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Review reason or notes"),{target:{value:"Unreadable licence"}});fireEvent.click(within(dialog).getByRole("checkbox"));fireEvent.click(within(dialog).getByRole("button",{name:"Confirm and save"}));
  await within(dialog).findByText(/The result of this action was not confirmed/);fireEvent.click(within(dialog).getByRole("button",{name:"Reload case status"}));
  await within(dialog).findByText("The case could not be loaded.");
  expect((within(dialog).getByLabelText("Review reason or notes") as HTMLInputElement).value).toBe("Unreadable licence");
  expect((within(dialog).getByRole("button",{name:"Confirm and save"}) as HTMLButtonElement).disabled).toBe(true);
  expect(partnerVerificationService.review).toHaveBeenCalledTimes(1);
 });

 it("requires a new explicit confirmation after the case reload shows the decision is still pending",async()=>{
  const rejected={...verificationDocument,status:"REJECTED" as const,reviewNote:"Unreadable licence"};
  vi.mocked(partnerVerificationService.review).mockRejectedValueOnce(new Error("No acknowledgement")).mockResolvedValue(rejected);
  vi.mocked(partnerVerificationService.detail).mockResolvedValueOnce(verificationDetail).mockResolvedValueOnce(verificationDetail).mockResolvedValue({...verificationDetail,documents:[rejected]});
  renderWithIntl(<AdminVerificationView subject="PROVIDER" id="org1"/>);
  fireEvent.click(await screen.findByRole("button",{name:"Reject document"}));const dialog=screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Review reason or notes"),{target:{value:"Unreadable licence"}});fireEvent.click(within(dialog).getByRole("checkbox"));fireEvent.click(within(dialog).getByRole("button",{name:"Confirm and save"}));
  await within(dialog).findByText(/The result of this action was not confirmed/);fireEvent.click(within(dialog).getByRole("button",{name:"Reload case status"}));
  await waitFor(()=>expect(within(dialog).queryByText(/The result of this action was not confirmed/)).toBeNull());
  expect(partnerVerificationService.review).toHaveBeenCalledTimes(1);
  expect((within(dialog).getByRole("button",{name:"Confirm and save"}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(within(dialog).getByRole("checkbox"));fireEvent.click(within(dialog).getByRole("button",{name:"Confirm and save"}));
  await screen.findByText("Information recorded on the server.");expect(partnerVerificationService.review).toHaveBeenCalledTimes(2);
 });

});
