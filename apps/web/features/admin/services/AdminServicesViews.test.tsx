import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { adminServicesService } from "@/services/admin-services.service";
import { AdminServiceBookingDetailView, AdminServiceBookingsView } from "./AdminServicesViews";

vi.mock("next/navigation", () => ({ usePathname: () => "/fa/admin/services" }));
vi.mock("@/services/admin-services.service", () => ({ adminServicesService: { listBookings: vi.fn(), getBooking: vi.fn() } }));

describe("Admin services", () => {
  it("lists bookings with human statuses and links to detail", async () => {
    vi.mocked(adminServicesService.listBookings).mockResolvedValue({ total: 1, page: 1, items: [{ id: "b1", bookingNumber: "PL-B-000009", status: "REQUESTED", paymentStatus: "NOT_REQUIRED", category: "VET", startAt: "2026-10-01T06:00:00.000Z", petName: "کوکی", providerName: "کلینیک مهر", serviceName: "ویزیت", priceAmount: 1_000_000, currency: "IRR" }] });
    renderWithIntl(<AdminServiceBookingsView />, "fa");
    expect(await screen.findByText("PL-B-000009")).toBeTruthy();
    expect(screen.getAllByText("درخواست ارسال شد").length).toBeGreaterThan(1); // status column and filter option
  });

  it("shows an explicit forbidden state on the detail page", async () => {
    vi.mocked(adminServicesService.getBooking).mockRejectedValue(new ApiError({ code: "ADMIN_PERMISSION_DENIED", message: "x", requestId: "r" }, 403));
    renderWithIntl(<AdminServiceBookingDetailView bookingId="b1" />, "en");
    expect(await screen.findByText("You do not have access")).toBeTruthy();
  });
});
