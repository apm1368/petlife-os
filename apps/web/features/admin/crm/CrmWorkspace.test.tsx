import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { CrmWorkspace } from "./CrmWorkspace";
import { HOUSEHOLDS, LEADS, TICKETS } from "./crm-sample-data";

/**
 * The CRM runs entirely on local sample data, so these tests exercise the real
 * component without any mocking — what renders here is what an admin sees.
 */
describe("CrmWorkspace", () => {
  it("opens on the agent's desk and says plainly that the data is not real", () => {
    render(<CrmWorkspace />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("CRM پت لایف");
    expect(screen.getByText(/داده‌های این بخش نمونه و ساختگی است/)).toBeTruthy();
    expect(screen.getByText("لیدهای باز من")).toBeTruthy();
  });

  it("carries no business-line concept anywhere in the workspace", () => {
    const { container } = render(<CrmWorkspace />);
    // The reference CRM threaded a lineId through every filter; PET LIFE is one
    // product, so the dimension should be absent rather than defaulted.
    expect(container.textContent).not.toContain("بیزنس لاین");
    expect(container.textContent).not.toContain("خط کسب‌وکار");
  });

  it("switches sections and filters leads through the API-shaped stage filter", () => {
    render(<CrmWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: /لیدها/ }));
    // Every seeded lead is listed before any filter narrows it.
    expect(screen.getByText("کلینیک دامپزشکی مهر")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("مرحله"), { target: { value: "won" } });
    expect(screen.getByText("پانسیون خانه پت")).toBeTruthy();
    expect(screen.queryByText("کلینیک دامپزشکی مهر")).toBeNull();
  });

  it("shows an empty state rather than a blank table when nothing matches", () => {
    render(<CrmWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: /لیدها/ }));

    fireEvent.change(screen.getByLabelText("جست‌وجو"), { target: { value: "چنین‌چیزی‌وجودندارد" } });
    expect(screen.getByText("لیدی با این فیلترها پیدا نشد.")).toBeTruthy();
  });

  it("opens a household's 360 drawer with its pets and linked records", () => {
    render(<CrmWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: /خانوارها/ }));

    fireEvent.click(screen.getByText("خانواده احمدی"));
    const drawer = screen.getByRole("dialog");
    expect(within(drawer).getByText(/بادوم/)).toBeTruthy();
    expect(within(drawer).getByText("ارزش عمر")).toBeTruthy();

    fireEvent.click(within(drawer).getByRole("button", { name: "بستن" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps ticket handling in the admin support workspace instead of duplicating it", () => {
    render(<CrmWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: /تیکت‌ها/ }));

    expect(screen.getByText(/رسیدگی به تیکت همچنان در «پشتیبانی» پنل ادمین انجام می‌شود/)).toBeTruthy();
  });

  it("switches the reports chart between metrics", () => {
    render(<CrmWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: /گزارشات/ }));

    const revenueTab = screen.getByRole("button", { name: "درآمد ماهانه" });
    expect(revenueTab.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "لیدهای جدید" }));
    expect(screen.getByRole("button", { name: "لیدهای جدید" }).getAttribute("aria-pressed")).toBe("true");
    expect(revenueTab.getAttribute("aria-pressed")).toBe("false");
  });

  it("counts only live work in the section badges", () => {
    render(<CrmWorkspace />);

    const openLeads = LEADS.filter((l) => l.stage !== "won" && l.stage !== "lost").length;
    const openTickets = TICKETS.filter((t) => t.status === "open" || t.status === "waiting").length;
    // Badges use Persian digits, same as every other number in the workspace.
    const fa = (n: number) => new Intl.NumberFormat("fa-IR").format(n);

    expect(screen.getByRole("button", { name: `لیدها ${fa(openLeads)}` })).toBeTruthy();
    expect(screen.getByRole("button", { name: `تیکت‌ها ${fa(openTickets)}` })).toBeTruthy();
    expect(HOUSEHOLDS.length).toBeGreaterThan(0);
  });
});
