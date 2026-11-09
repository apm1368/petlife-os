import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { AdminOrderFinancialsDto, AdminRefundApprovalDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminService } from "@/services/admin.service";
import { AdminTransactionsView } from "./AdminTransactionsView";
import en from "@/messages/en.json";
import fa from "@/messages/fa.json";
import de from "@/messages/de.json";
import es from "@/messages/es.json";

vi.mock("@/services/admin.service", () => ({
  adminService: {
    getOrderFinancials: vi.fn(),
    requestRefundApproval: vi.fn(),
    getRefundApproval: vi.fn(),
    approveRefund: vi.fn(),
    rejectRefund: vi.fn(),
    executeRefund: vi.fn(),
  },
}));

const FINANCIALS: AdminOrderFinancialsDto = {
  orderId: "order-1",
  paymentIntents: [{
    id: "intent-1",
    amount: 125_000,
    currency: "IRR",
    status: "CAPTURED" as never,
    provider: "STANDARD_GATEWAY" as never,
    createdAt: "2026-11-12T08:00:00.000Z",
    attempts: [],
    transactions: [],
    refunds: [{
      id: "refund-1",
      amount: 10_000,
      currency: "IRR",
      status: "SUCCEEDED" as never,
      reason: null,
      createdAt: "2026-11-12T08:00:00.000Z",
      completedAt: null,
    }],
  }],
  ledgerEntries: [{
    id: "ledger-1",
    direction: "DEBIT" as never,
    amount: 125_000,
    accountCode: "CUSTOMER_PAYMENT_CLEARING" as never,
    accountName: "Raw account name must not replace locale label",
    createdAt: "2026-11-12T08:00:00.000Z",
  }],
};

const APPROVAL: AdminRefundApprovalDto = {
  id: "approval-1",
  orderId: "order-1",
  amount: 1000,
  reason: "Owner-approved correction",
  status: "REQUESTED" as never,
  requestedByAdmin: { id: "admin-1", displayName: "Finance admin", role: "FINANCE" as never },
  approvedByAdmin: null,
  refundId: null,
  createdAt: "2026-11-12T08:00:00.000Z",
  updatedAt: "2026-11-12T08:00:00.000Z",
  executedAt: null,
};

function leafKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [prefix];
  return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key));
}

describe("AdminTransactionsView", () => {
  afterEach(() => vi.unstubAllGlobals());

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(adminService.getOrderFinancials).mockResolvedValue(FINANCIALS);
    vi.mocked(adminService.requestRefundApproval).mockResolvedValue(APPROVAL);
    vi.mocked(adminService.approveRefund).mockResolvedValue({ ...APPROVAL, status: "APPROVED" as never });
    vi.mocked(adminService.rejectRefund).mockResolvedValue({ ...APPROVAL, status: "REJECTED" as never });
    vi.mocked(adminService.executeRefund).mockResolvedValue({ ...APPROVAL, status: "EXECUTED" as never });
    vi.mocked(adminService.getRefundApproval).mockResolvedValue(APPROVAL);
  });

  it.each([
    ["de", "Finanztransaktionen", "Eingezogen", "Erstattet", "Verrechnungskonto für Kundenzahlungen"],
    ["es", "Transacciones financieras", "Cobrado", "Reembolsado", "Cuenta de compensación de pagos de clientes"],
  ] as const)("renders the complete financial page in %s without Persian or raw enum/source labels", async (locale, title, captured, refunded, account) => {
    renderWithIntl(<AdminTransactionsView />, locale);
    fireEvent.change(screen.getByLabelText(locale === "de" ? "Bestellnummer" : "Número de pedido"), { target: { value: "order-1" } });
    fireEvent.click(screen.getByRole("button", { name: locale === "de" ? "Suchen" : "Buscar" }));

    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(await screen.findByText(captured)).toBeTruthy();
    expect(screen.getByText(refunded)).toBeTruthy();
    expect(screen.getByText(account)).toBeTruthy();
    expect(screen.getByText(locale === "de" ? "Soll" : "Debe")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[؀-ۿ]/);
    expect(document.body.textContent).not.toMatch(/CAPTURED|SUCCEEDED|DEBIT/);
    expect(screen.queryByText("Raw account name must not replace locale label")).toBeNull();
  });

  it.each(["fa", "en", "de", "es"] as const)("keeps the initial prompt and empty records localized in %s", async (locale) => {
    const messages = locale === "fa" ? fa.admin.transactions : locale === "de" ? de.admin.transactions : locale === "es" ? es.admin.transactions : en.admin.transactions;
    vi.mocked(adminService.getOrderFinancials).mockResolvedValueOnce({ orderId: "order-empty", paymentIntents: [], ledgerEntries: [] });
    renderWithIntl(<AdminTransactionsView />, locale);
    expect(screen.getByText(messages.states.lookupPrompt)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(messages.orderIdLabel), { target: { value: "order-empty" } });
    fireEvent.click(screen.getByRole("button", { name: messages.lookup }));
    expect(await screen.findByText(messages.states.noPaymentIntents)).toBeTruthy();
    expect(screen.getByText(messages.states.noLedgerEntries)).toBeTruthy();
    if (locale !== "fa") expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]/);
  });

  it.each([
    ["de", de.admin.transactions.states.lookupFailed],
    ["es", es.admin.transactions.states.lookupFailed],
  ] as const)("localizes lookup failure in %s without exposing backend errors", async (locale, message) => {
    vi.mocked(adminService.getOrderFinancials).mockRejectedValueOnce(new Error("private backend exception"));
    renderWithIntl(<AdminTransactionsView />, locale);
    fireEvent.change(screen.getByLabelText(locale === "de" ? "Bestellnummer" : "Número de pedido"), { target: { value: "order-1" } });
    fireEvent.click(screen.getByRole("button", { name: locale === "de" ? "Suchen" : "Buscar" }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("private backend exception")).toBeNull();
    expect(document.body.textContent).not.toMatch(/[؀-ۿ]/);
  });

  it.each([["de", de.admin.transactions.states.loading], ["es", es.admin.transactions.states.loading]] as const)("labels the loading state in %s", async (locale, loadingLabel) => {
    vi.mocked(adminService.getOrderFinancials).mockReturnValueOnce(new Promise(() => undefined));
    renderWithIntl(<AdminTransactionsView />, locale);
    fireEvent.change(screen.getByLabelText(locale === "de" ? "Bestellnummer" : "Número de pedido"), { target: { value: "order-1" } });
    fireEvent.click(screen.getByRole("button", { name: locale === "de" ? "Suchen" : "Buscar" }));
    expect(await screen.findByRole("status", { name: loadingLabel })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]/);
  });

  it.each([["de", de.admin.transactions.states.offline], ["es", es.admin.transactions.states.offline]] as const)("distinguishes offline lookup failure in %s", async (locale, offlineText) => {
    vi.stubGlobal("navigator", { onLine: false });
    vi.mocked(adminService.getOrderFinancials).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderWithIntl(<AdminTransactionsView />, locale);
    fireEvent.change(screen.getByLabelText(locale === "de" ? "Bestellnummer" : "Número de pedido"), { target: { value: "order-1" } });
    fireEvent.click(screen.getByRole("button", { name: locale === "de" ? "Suchen" : "Buscar" }));
    expect((await screen.findByRole("alert")).textContent).toContain(offlineText);
  });

  it.each([
    ["de", de.admin.transactions.states.accessDenied],
    ["es", es.admin.transactions.states.accessDenied],
  ] as const)("renders localized no-access state in %s", async (locale, message) => {
    vi.mocked(adminService.getOrderFinancials).mockRejectedValueOnce(new ApiError({ code: "FORBIDDEN", message: "Forbidden", requestId: "test" }, 403));
    renderWithIntl(<AdminTransactionsView />, locale);
    fireEvent.change(screen.getByLabelText(locale === "de" ? "Bestellnummer" : "Número de pedido"), { target: { value: "order-1" } });
    fireEvent.click(screen.getByRole("button", { name: locale === "de" ? "Suchen" : "Buscar" }));
    expect((await screen.findByRole("alert")).textContent).toContain(message);
  });

  it("submits a reasoned refund request and shows localized approval status without changing the finance API flow", async () => {
    renderWithIntl(<AdminTransactionsView />, "es");
    fireEvent.change(screen.getByLabelText("Número de pedido"), { target: { value: "order-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    await screen.findByText("Cobrado");
    fireEvent.change(screen.getByLabelText("Importe en riales"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "correction" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar solicitud" }));
    expect(await screen.findByText("Solicitado")).toBeTruthy();
    expect(adminService.requestRefundApproval).toHaveBeenCalledWith({ orderId: "order-1", amount: 1000, reason: "correction" });
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    await waitFor(() => expect(adminService.approveRefund).toHaveBeenCalledWith("approval-1"));
    expect(adminService.getRefundApproval).toHaveBeenCalledWith("approval-1");
  });

  it("requires a positive whole-Rial refund amount before enabling a request", async () => {
    renderWithIntl(<AdminTransactionsView />);
    fireEvent.change(screen.getByLabelText("Order ID"), { target: { value: "order-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));
    await screen.findByText("Captured");
    const amount = screen.getByLabelText("Amount in Rial");
    const reason = screen.getByLabelText("Reason");
    const submit = screen.getByRole("button", { name: "Request" }) as HTMLButtonElement;
    fireEvent.change(amount, { target: { value: "1000.5" } });
    fireEvent.change(reason, { target: { value: "correction" } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(amount, { target: { value: "1000" } });
    expect(submit.disabled).toBe(false);
  });

  it.each([["de", de.admin.transactions.states.actionFailed], ["es", es.admin.transactions.states.actionFailed]] as const)("shows a localized action failure in %s", async (locale, errorText) => {
    vi.mocked(adminService.getOrderFinancials).mockResolvedValueOnce(FINANCIALS);
    vi.mocked(adminService.requestRefundApproval).mockRejectedValueOnce(new Error("backend detail"));
    renderWithIntl(<AdminTransactionsView />, locale);
    fireEvent.change(screen.getByLabelText(locale === "de" ? "Bestellnummer" : "Número de pedido"), { target: { value: "order-1" } });
    fireEvent.click(screen.getByRole("button", { name: locale === "de" ? "Suchen" : "Buscar" }));
    await screen.findByText(locale === "de" ? "Eingezogen" : "Cobrado");
    fireEvent.change(screen.getByLabelText(locale === "de" ? "Betrag in Rial" : "Importe en riales"), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText(locale === "de" ? "Begründung" : "Motivo"), { target: { value: "correct" } });
    fireEvent.click(screen.getByRole("button", { name: locale === "de" ? "Anfrage senden" : "Enviar solicitud" }));
    expect((await screen.findByRole("alert")).textContent).toContain(errorText);
    expect(screen.queryByText("backend detail")).toBeNull();
  });

  it.each([[de, "de"], [es, "es"]] as const)("provides a complete application-owned transaction dictionary for %s", (catalog, _locale) => {
    expect(leafKeys(catalog.admin.transactions).sort()).toEqual(leafKeys(en.admin.transactions).sort());
    expect(JSON.stringify(catalog.admin.transactions)).not.toMatch(/[\u0600-\u06ff]/);
  });
});
