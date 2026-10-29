import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { petExpensesService } from "@/services/pet-expenses.service";
import { PetExpensesView } from "./PetExpensesView";
import type { PetExpensesDto } from "@petlife/types";

vi.mock("@/services/pet-expenses.service", () => ({ petExpensesService: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() } }));

const year = new Date().getUTCFullYear();
const data: PetExpensesDto = {
  from: `${year}-01-01`,
  to: `${year}-12-31`,
  totalIrr: 3_600_000,
  byCategory: [{ category: "FOOD", amountIrr: 3_000_000 }, { category: "VET", amountIrr: 600_000 }],
  bySource: [{ source: "MANUAL", amountIrr: 3_000_000 }, { source: "BOOKING", amountIrr: 600_000 }],
  entries: [
    { id: "m1", source: "MANUAL", category: "FOOD", amountIrr: 3_000_000, spentOn: `${year}-01-15`, note: "15kg bag", label: null, sourceRecordId: null },
    { id: "booking:b1", source: "BOOKING", category: "VET", amountIrr: 600_000, spentOn: `${year}-01-10`, note: null, label: "General visit", sourceRecordId: "b1" },
  ],
};

describe("PetExpensesView", () => {
  beforeEach(() => {
    vi.mocked(petExpensesService.list).mockReset().mockResolvedValue(data);
    vi.mocked(petExpensesService.create).mockReset().mockResolvedValue(data.entries[0]!);
    vi.mocked(petExpensesService.remove).mockReset().mockResolvedValue({ deleted: true });
  });

  it("shows totals, category shares and a row per expense; derived rows link to their source, not to edit", async () => {
    renderWithIntl(<PetExpensesView petId="p1" />, "en");
    expect(await screen.findByText("360,000 Toman")).toBeTruthy();
    expect(petExpensesService.list).toHaveBeenCalledWith("p1", `${year}-01-01`, `${year}-12-31`);
    const booking = screen.getByText(/General visit/).closest("li")!;
    expect(within(booking).getByRole("link", { name: "View booking" }).getAttribute("href")).toBe("/en/bookings/b1");
    expect(within(booking).queryByRole("button", { name: "Edit" })).toBeNull();
    const manual = screen.getByText(/15kg bag/).closest("li")!;
    expect(within(manual).getByRole("button", { name: "Edit" })).toBeTruthy();
  });

  it("adds an expense in Toman and sends IRR to the API", async () => {
    renderWithIntl(<PetExpensesView petId="p1" />, "en");
    await screen.findByText("360,000 Toman");
    fireEvent.click(screen.getAllByRole("button", { name: "Add expense" })[0]!);
    fireEvent.change(screen.getByLabelText("Amount (Toman)"), { target: { value: "250,000" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "MEDICATION" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(petExpensesService.create).toHaveBeenCalled());
    expect(vi.mocked(petExpensesService.create).mock.calls[0]![1]).toMatchObject({ category: "MEDICATION", amountIrr: 2_500_000 });
  });

  it("refuses a non-numeric amount without calling the API", async () => {
    renderWithIntl(<PetExpensesView petId="p1" />, "en");
    await screen.findByText("360,000 Toman");
    fireEvent.click(screen.getAllByRole("button", { name: "Add expense" })[0]!);
    fireEvent.change(screen.getByLabelText("Amount (Toman)"), { target: { value: "lots" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter a whole amount in Toman.")).toBeTruthy();
    expect(petExpensesService.create).not.toHaveBeenCalled();
  });

  it("asks before deleting, then deletes", async () => {
    renderWithIntl(<PetExpensesView petId="p1" />, "en");
    const manual = (await screen.findByText(/15kg bag/)).closest("li")!;
    fireEvent.click(within(manual).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(manual).getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(petExpensesService.remove).toHaveBeenCalledWith("p1", "m1"));
  });

  it("offers a first entry when the year is empty", async () => {
    vi.mocked(petExpensesService.list).mockResolvedValue({ ...data, totalIrr: 0, byCategory: [], bySource: [], entries: [] });
    renderWithIntl(<PetExpensesView petId="p1" />, "en");
    expect(await screen.findByText("No expenses recorded for this year yet")).toBeTruthy();
  });

  it("is Persian in Persian, with a Jalali year and Toman amounts", async () => {
    renderWithIntl(<PetExpensesView petId="p1" />, "fa");
    expect(await screen.findByText("۳۶۰٬۰۰۰ تومان")).toBeTruthy();
    const [from] = vi.mocked(petExpensesService.list).mock.calls[0]!.slice(1) as string[];
    expect(from!.slice(5)).toMatch(/^03-2[01]$/); // a Jalali year starts at Nowruz
  });
});
