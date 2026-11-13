import { describe, expect, it, vi, beforeEach } from "vitest";
import { useState } from "react";
import { fireEvent, screen } from "@testing-library/react";
import type { MedicalDocumentDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { BookingDocumentPicker } from "./BookingDocumentPicker";

vi.mock("@/services/health-advanced.service", () => ({ healthAdvancedService: { listDocuments: vi.fn() } }));

function doc(id: string, title: string, over: Partial<MedicalDocumentDto> = {}): MedicalDocumentDto {
  return {
    id, petId: "pet-1", householdId: "hh-1", documentType: "LAB_REPORT" as never, title, description: null, sourceType: "OWNER" as never,
    source: { providerOrganizationId: null, providerOrganizationName: null, providerUserId: null, providerUserDisplayTitle: null, userId: "u1" },
    recordedAt: "2026-04-01T00:00:00.000Z", uploadedAt: "2026-04-02T00:00:00.000Z", mimeType: "application/pdf", fileSizeBytes: 100,
    visibility: "HOUSEHOLD_ONLY" as never, verificationStatus: "UNVERIFIED" as never, relatedVisitId: null, relatedLabResultId: null, relatedImagingStudyId: null,
    relatedReferralId: null, voidedAt: null, voidedReason: null, createdAt: "2026-04-02T00:00:00.000Z", updatedAt: "2026-04-02T00:00:00.000Z", ...over,
  };
}

function Harness({ onChange }: { onChange: (ids: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  return <BookingDocumentPicker petId="pet-1" selected={selected} onChange={(ids) => { setSelected(ids); onChange(ids); }} />;
}

describe("BookingDocumentPicker", () => {
  beforeEach(() => vi.mocked(healthAdvancedService.listDocuments).mockReset());

  it("offers only the owner's own current documents, none ticked, and reports exactly the ticked ones", async () => {
    vi.mocked(healthAdvancedService.listDocuments).mockResolvedValue([
      doc("d1", "Blood panel"),
      doc("d2", "X-ray report"),
      doc("d3", "Retracted upload", { voidedAt: "2026-05-01T00:00:00.000Z" }),
      doc("d4", "Clinic discharge summary", { sourceType: "PROVIDER" as never }),
    ]);
    const onChange = vi.fn();
    renderWithIntl(<Harness onChange={onChange} />);

    const first = await screen.findByRole("checkbox", { name: /Blood panel/ });
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.queryByText("Retracted upload")).toBeNull();
    expect(screen.queryByText("Clinic discharge summary")).toBeNull();
    expect(screen.getAllByRole("checkbox").every((box) => !(box as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByText("Documents for this vet (optional)")).toBeTruthy();

    fireEvent.click(first);
    expect(onChange).toHaveBeenLastCalledWith(["d1"]);
    fireEvent.click(screen.getByRole("checkbox", { name: /X-ray report/ }));
    expect(onChange).toHaveBeenLastCalledWith(["d1", "d2"]);
    fireEvent.click(first);
    expect(onChange).toHaveBeenLastCalledWith(["d2"]);
  });

  it("says so when there is nothing to share, and lets the owner continue when loading fails", async () => {
    vi.mocked(healthAdvancedService.listDocuments).mockResolvedValueOnce([]);
    const { unmount } = renderWithIntl(<Harness onChange={vi.fn()} />);
    expect(await screen.findByText("No health documents uploaded for this pet yet.")).toBeTruthy();
    unmount();

    vi.mocked(healthAdvancedService.listDocuments).mockRejectedValueOnce(new Error("offline"));
    renderWithIntl(<Harness onChange={vi.fn()} />, "fa");
    expect(await screen.findByText("اسناد شما بارگذاری نشد. می‌توانید بدون اشتراک سند ادامه دهید.")).toBeTruthy();
  });
});
