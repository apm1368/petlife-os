import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import type { VerificationQueueItem } from "@/services/partner-verification.service";
import { verificationDocument } from "@/test/fixtures/partner-verification";
import { VerificationQueueCard } from "./VerificationQueueCard";
import { VerificationDocumentList } from "./VerificationDocumentList";

const received = "2026-10-15T21:00:00Z";
const row: VerificationQueueItem = { subjectType:"PROVIDER", id:"org1", name:"کلینیک همراه", kind:"VET_CLINIC", status:"SUBMITTED", submittedAt:received, waitingHours:0, documents:{pending:1,accepted:2,rejected:3,expired:0} };
describe("Verification presentation", () => {
  it("shows each real evidence count separately with Persian digits and Tehran calendar time", () => {
    renderWithIntl(<VerificationQueueCard row={row}/>,"fa");
    const counts = screen.getByRole("heading", {name:"وضعیت مدارک"}).nextElementSibling!;
    expect(within(counts as HTMLElement).getByText("منتظر بررسی")).toBeTruthy();
    expect(within(counts as HTMLElement).getByText("۱")).toBeTruthy();
    expect(within(counts as HTMLElement).getByText("۲")).toBeTruthy();
    expect(within(counts as HTMLElement).getByText("۳")).toBeTruthy();
    expect(within(counts as HTMLElement).getByText("۰")).toBeTruthy();
    const time = document.querySelector("time")!;
    expect(time.dateTime).toBe(received);
    expect(time.textContent).toContain("۲۴ مهر ۱۴۰۵");
    expect(time.textContent).toContain("۰:۳۰");
    expect(screen.getByRole("link",{name:"بررسی پرونده و مدارک"}).getAttribute("href")).toBe("/fa/admin/verification/provider/org1");
  });
  it("keeps missing submission data unknown instead of implying zero waiting time", () => {
    renderWithIntl(<VerificationQueueCard row={{...row,subjectType:"SELLER",kind:"UNKNOWN",submittedAt:null,waitingHours:null}}/>);
    expect(screen.getByText("Not recorded")).toBeTruthy();
    expect(screen.getByText(/Other organization/)).toBeTruthy();
    expect(document.querySelector("time")).toBeNull();
    expect(screen.queryByText(/hours since submission/)).toBeNull();
    expect(screen.getByRole("link",{name:"Review case and documents"}).getAttribute("href")).toBe("/en/admin/verification/seller/org1");
  });
  it("labels the rejection reason and file metadata without offering private-file access by default", () => {
    renderWithIntl(<VerificationDocumentList documents={[{...verificationDocument,status:"REJECTED",submittedAt:received,reviewNote:"Image is unreadable",rejectionReason:"Image is unreadable",reviewedAt:received}]}/>);
    expect(screen.getByRole("heading",{name:"Reason for rejection"})).toBeTruthy();
    expect(screen.getAllByText("Image is unreadable")).toHaveLength(1);
    expect(screen.getByText("PDF document · 1 KB")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    const uploaded=document.querySelector("time");
    expect(uploaded).not.toBeNull();
    expect(uploaded!.textContent).toContain("October 16");
  });
  it("distinguishes pending review and missing expiry and retains a rejection-only note", () => {
    renderWithIntl(<VerificationDocumentList documents={[{...verificationDocument,mimeType:"application/octet-stream",status:"REJECTED",reviewNote:null,rejectionReason:"Replacement required"}]}/>);
    expect(screen.getByText("Replacement required")).toBeTruthy();
    expect(screen.getByText("Not reviewed yet")).toBeTruthy();
    expect(screen.getByText("No recorded expiry")).toBeTruthy();
  });
});
