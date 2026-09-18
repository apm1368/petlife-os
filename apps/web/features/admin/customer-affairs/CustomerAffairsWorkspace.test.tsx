import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { CustomerAffairsWorkspace } from "./CustomerAffairsWorkspace";
import { CA_TICKETS, OPEN_TICKET_STATUSES, SLA_HOURS, slaState } from "./ca-sample-data";

const fa = (n: number) => new Intl.NumberFormat("fa-IR").format(n);

/** The console runs on local sample data, so these tests drive the real component unmocked. */
describe("CustomerAffairsWorkspace", () => {
  it("opens on the agent's desk and states plainly that the data is not real", () => {
    render(<CustomerAffairsWorkspace />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("امور مشتریان پت لایف");
    expect(screen.getByText(/داده‌های این بخش نمونه و ساختگی است/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "میز کار من" })).toBeTruthy();
  });

  it("carries no business-line dimension anywhere", () => {
    const { container } = render(<CustomerAffairsWorkspace />);
    expect(container.textContent).not.toContain("بیزنس");
    expect(container.textContent).not.toContain("خط کسب‌وکار");
  });

  it("surfaces breached tickets as a banner rather than burying them in a table", () => {
    render(<CustomerAffairsWorkspace />);

    const breached = CA_TICKETS.filter((t) => OPEN_TICKET_STATUSES.includes(t.status) && slaState(t) === "breached");
    expect(breached.length).toBeGreaterThan(0);
    expect(screen.getByText(`${fa(breached.length)} تیکت از مهلت پاسخ گذشته است.`)).toBeTruthy();
  });

  it("orders the inbox by nearest deadline so the most overdue item is first", () => {
    render(<CustomerAffairsWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: /اینباکس/ }));

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.length).toBeGreaterThan(1);
    // Ascending by remaining time, so the *most* overdue leads: TK-7304 is 18
    // hours past its deadline, ahead of ES-512 which is only one hour over.
    expect(rows[0]?.textContent).toContain("TK-7304");
    expect(rows[0]?.textContent).toContain("عقب‌افتاده");

    const order = rows.map((r) => r.textContent ?? "");
    expect(order.findIndex((t) => t.includes("TK-7304"))).toBeLessThan(order.findIndex((t) => t.includes("ES-512")));
  });

  it("filters the inbox down to one record type", () => {
    render(<CustomerAffairsWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: /اینباکس/ }));

    fireEvent.change(screen.getByLabelText("نوع"), { target: { value: "escalation" } });
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.every((r) => r.textContent?.includes("ارجاع"))).toBe(true);
  });

  it("opens a customer's 360 file and switches between its tabs", () => {
    render(<CustomerAffairsWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: /مشتریان/ }));

    fireEvent.click(screen.getByText("نگین شریفی"));
    const drawer = screen.getByRole("dialog");
    expect(within(drawer).getByText("بادوم · سگ")).toBeTruthy();

    fireEvent.click(within(drawer).getByRole("button", { name: "تیکت‌ها" }));
    expect(within(drawer).getByText("کسر دوباره هزینه اشتراک پلاس")).toBeTruthy();

    fireEvent.click(within(drawer).getByRole("button", { name: "بستن" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the QA scorecard model from the same weights evaluations are scored on", () => {
    render(<CustomerAffairsWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: /کنترل کیفیت/ }));
    fireEvent.click(screen.getByRole("button", { name: "اسکورکارت" }));

    // The ten criteria are weighted to total 100, which the panel prints.
    expect(screen.getByText(/مجموع وزن‌ها: ۱۰۰/)).toBeTruthy();
    expect(screen.getByText("نقض محرمانگی پرونده سلامت")).toBeTruthy();
  });

  it("derives the settings SLA table from the constant the tickets are judged by", () => {
    render(<CustomerAffairsWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: /تنظیمات/ }));

    expect(screen.getByText(`${fa(SLA_HOURS.critical)} ساعت`)).toBeTruthy();
    expect(screen.getByText(`${fa(SLA_HOURS.low)} ساعت`)).toBeTruthy();
  });

  it("records that playing a recording is an auditable access, not a silent read", () => {
    render(<CustomerAffairsWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: /تماس‌ها/ }));

    fireEvent.click(screen.getAllByRole("button", { name: "پخش" })[0]!);
    expect(screen.getByText(/دسترسی به فایل در «لاگ تغییرات» ثبت می‌شود/)).toBeTruthy();
  });

  it("keeps the change log's previous value, which is the point of the log", () => {
    render(<CustomerAffairsWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: /لاگ تغییرات/ }));

    const row = screen.getByText("تغییر اولویت").closest("tr");
    expect(row?.textContent).toContain("بالا");
    expect(row?.textContent).toContain("بحرانی");
  });
});
