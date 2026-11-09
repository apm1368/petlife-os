import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import type { RepeatDeliveryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { RepeatDeliveryCreateView, RepeatDeliveryDetailView, RepeatDeliveryListView } from "./RepeatDeliveryViews";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  listRepeat: vi.fn(),
  getRepeat: vi.fn(),
  getProductDetail: vi.fn(),
  createRepeat: vi.fn(),
  repeatAction: vi.fn(),
  updateRepeat: vi.fn(),
  listAddresses: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams("offerId=offer-1&productId=product-1&quantity=2"),
}));
vi.mock("@/hooks/use-active-pet", () => ({ useActivePet: () => ({ householdId: "household-1" }) }));
vi.mock("@/services/commerce.service", () => ({
  commerceService: {
    listRepeatDeliveries: mocks.listRepeat,
    getRepeatDelivery: mocks.getRepeat,
    getProductDetail: mocks.getProductDetail,
    createRepeatDelivery: mocks.createRepeat,
    repeatDeliveryAction: mocks.repeatAction,
    updateRepeatDelivery: mocks.updateRepeat,
  },
}));
vi.mock("@/services/addresses.service", () => ({ addressesService: { list: mocks.listAddresses } }));

const repeat = (overrides: Partial<RepeatDeliveryDto> = {}) => ({
  id: "repeat-1",
  status: "ACTIVE",
  product: { id: "product-1", title: "User-authored product name", imageUrl: null },
  variantTitle: null,
  sellerOrganization: { id: "seller-1", name: "Seller name", verificationStatus: "VERIFIED", status: "ACTIVE", city: "Tehran" },
  sellerOfferId: "offer-1",
  quantity: 2,
  intervalDays: 30,
  allowedIntervalsDays: [14, 30, 60],
  nextCycleAt: "2026-01-02T12:00:00.000Z",
  addressId: "address-1",
  addressLabel: "Home",
  acceptedUnitPrice: 1250000,
  currentUnitPrice: 1250000,
  priceChanged: false,
  available: true,
  lastOrderId: "order-1",
  events: [{ type: "CREATED", note: null, createdAt: "2025-12-01T12:00:00.000Z" }],
  createdAt: "2025-12-01T12:00:00.000Z",
  ...overrides,
}) as unknown as RepeatDeliveryDto;

const address = { id: "address-1", label: "Home", addressLine: "Main street 10", city: "Tehran", isDefault: true };
const offer = {
  id: "offer-1",
  productVariantId: "variant-1",
  repeatDeliveryEligible: true,
  repeatIntervalsDays: [14, 30],
  effectiveUnitPrice: 1250000,
  sellerOrganization: { id: "seller-1", name: "Seller name" },
};
const product = {
  id: "product-1",
  title: "User-authored product name",
  media: [],
  variants: [{ id: "variant-1", title: "Source variant" }],
  offers: [offer],
};

describe("repeat delivery localization", () => {
  const onlineStatus = navigator.onLine;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAddresses.mockResolvedValue([address]);
    mocks.getProductDetail.mockResolvedValue(product);
    mocks.createRepeat.mockResolvedValue(repeat());
    mocks.repeatAction.mockResolvedValue(repeat());
    mocks.updateRepeat.mockResolvedValue(repeat());
  });

  afterEach(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: onlineStatus });
  });

  it.each([
    ["de", "Wiederkehrende Lieferungen", "Noch keine wiederkehrenden Lieferungen", "Produkte ansehen"],
    ["es", "Entregas periódicas", "Todavía no tienes entregas periódicas", "Ver productos"],
  ] as const)("renders the fully translated empty list state in %s", async (locale, title, empty, browse) => {
    mocks.listRepeat.mockResolvedValue([]);
    renderWithIntl(<RepeatDeliveryListView />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByText(empty)).toBeTruthy();
    expect(screen.getByRole("button", { name: browse })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([["de", "Wiederkehrende Lieferungen"], ["es", "Entregas periódicas"]] as const)("renders localized loading and recoverable error states in %s", async (locale, title) => {
    mocks.listRepeat.mockReturnValue(new Promise(() => undefined));
    const loading = renderWithIntl(<RepeatDeliveryListView />, locale);
    expect(screen.getByLabelText(locale === "de" ? "Wird geladen" : "Cargando")).toBeTruthy();
    loading.unmount();
    mocks.listRepeat.mockRejectedValue(new Error("transport failure"));
    renderWithIntl(<RepeatDeliveryListView />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByText(locale === "de" ? "Wiederkehrende Lieferungen konnten nicht geladen werden. Bitte versuche es erneut." : "No se pudieron cargar las entregas periódicas. Inténtalo de nuevo.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([["de", "Kein Zugriff"], ["es", "No tienes acceso"]] as const)("distinguishes a forbidden response in %s", async (locale, title) => {
    mocks.listRepeat.mockRejectedValue(new ApiError({ code: "FORBIDDEN", message: "Persian backend text", requestId: "r1" }, 403));
    renderWithIntl(<RepeatDeliveryListView />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(document.body.textContent).not.toContain("Persian backend text");
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([["de", "Du bist offline"], ["es", "No tienes conexión"]] as const)("shows the offline state without confusing it with an empty list in %s", async (locale, title) => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    mocks.listRepeat.mockRejectedValue(new Error("network unreachable"));
    renderWithIntl(<RepeatDeliveryListView />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.queryByText(locale === "de" ? "Noch keine wiederkehrenden Lieferungen" : "Todavía no tienes entregas periódicas")).toBeNull();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([
    ["de", "Wiederkehrende Lieferungen", "Aktiv", "2 × alle 30 Tage", "Als Nächstes: 02.01.2026"],
    ["es", "Entregas periódicas", "Activa", "2 × cada 30 días", "Próxima: 2 ene 2026"],
  ] as const)("renders localized live list data and source-authored names in %s", async (locale, title, status, summary, nextDate) => {
    mocks.listRepeat.mockResolvedValue([repeat()]);
    renderWithIntl(<RepeatDeliveryListView />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByText(status)).toBeTruthy();
    expect(screen.getByText(new RegExp(summary))).toBeTruthy();
    expect(document.body.textContent).toContain(nextDate);
    expect(screen.getByText("User-authored product name")).toBeTruthy();
    expect(document.body.textContent).toContain("Seller name");
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([
    ["de", "Wiederkehrende Lieferung einrichten", "Lieferadresse", "Keine automatische Abbuchung"],
    ["es", "Configurar entrega periódica", "Dirección de entrega", "Sin cargos automáticos"],
  ] as const)("renders the translated creation form and four-locale date/price context in %s", async (locale, title, addressLabel, noAutopay) => {
    renderWithIntl(<RepeatDeliveryCreateView />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByLabelText(addressLabel)).toBeTruthy();
    expect(screen.getByText(noAutopay)).toBeTruthy();
    expect(document.body.textContent).toContain("Seller name");
    expect(document.body.textContent).toContain("125.000 Toman");
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([
    ["de", "Alle wiederkehrenden Lieferungen", "Neuer Preis akzeptiert."],
    ["es", "Todas las entregas periódicas", "Nuevo precio aceptado."],
  ] as const)("renders translated detail actions and outcomes in %s", async (locale, back, accepted) => {
    mocks.getRepeat.mockResolvedValue(repeat({ priceChanged: true, currentUnitPrice: 1300000 }));
    renderWithIntl(<RepeatDeliveryDetailView id="repeat-1" />, locale);
    expect(await screen.findByRole("button", { name: back })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: locale === "de" ? "Neuen Preis akzeptieren" : "Aceptar nuevo precio" }));
    expect((await screen.findByRole("status")).textContent).toContain(accepted);
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([
    ["de", "Wiederkehrende Lieferung einrichten", "Adressen konnten nicht geladen werden. Bitte versuche es erneut."],
    ["es", "Configurar entrega periódica", "No se pudieron cargar las direcciones. Inténtalo de nuevo."],
  ] as const)("shows a localized retryable address error in %s", async (locale, title, error) => {
    mocks.getProductDetail.mockResolvedValue(product);
    mocks.listAddresses.mockRejectedValueOnce(new Error("server message"));
    renderWithIntl(<RepeatDeliveryCreateView />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect((await screen.findByRole("alert")).textContent).toContain(error);
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it("localizes unknown event and status codes instead of exposing raw identifiers", async () => {
    mocks.getRepeat.mockResolvedValue(repeat({ status: "UNRECOGNIZED" as never, events: [{ type: "UNRECOGNIZED", note: null, createdAt: "2025-12-01T12:00:00.000Z" }] }));
    renderWithIntl(<RepeatDeliveryDetailView id="repeat-1" />, "de");
    expect(await screen.findByText("Unbekannter Status")).toBeTruthy();
    expect(screen.getByText("Aktualisiert")).toBeTruthy();
    expect(screen.queryByText("UNRECOGNIZED")).toBeNull();
  });
});
