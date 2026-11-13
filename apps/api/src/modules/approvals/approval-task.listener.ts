import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { approvalTaskKey } from "./approval-policy";
import { ApprovalTaskService } from "./approval-task.service";

/**
 * Closes approval follow-up tasks when the request resolves on its own: the partner accepted or rejected it, it
 * expired, or someone cancelled it. Each handler is a no-op when there is no open task (an instant booking, or a task
 * staff already closed), so it can listen to every outcome. AutomaticTaskService.resolve never throws without a tx.
 */
@Injectable()
export class ApprovalTaskListener {
  constructor(private readonly tasks: ApprovalTaskService) {}

  @OnEvent("ServiceBookingAccepted")
  async onServiceAccepted(payload: { bookingId: string }) {
    await this.tasks.resolve(approvalTaskKey.serviceBooking(payload.bookingId), "بسته شد: ارائه‌دهنده درخواست را پذیرفت.");
  }

  @OnEvent("ServiceBookingRejected")
  async onServiceRejected(payload: { bookingId: string }) {
    await this.tasks.resolve(approvalTaskKey.serviceBooking(payload.bookingId), "بسته شد: ارائه‌دهنده درخواست را رد کرد.");
  }

  @OnEvent("ServiceBookingExpired")
  async onServiceExpired(payload: { bookingId: string }) {
    await this.tasks.resolve(approvalTaskKey.serviceBooking(payload.bookingId), "بسته شد: مهلت پاسخ به درخواست تمام شد.");
  }

  @OnEvent("ServiceBookingCancelled")
  async onServiceCancelled(payload: { bookingId: string }) {
    await this.tasks.resolve(approvalTaskKey.serviceBooking(payload.bookingId), "بسته شد: رزرو لغو شد.");
  }

  // Stays: a request leaves AWAITING_PROVIDER as confirmed, awaiting payment (accepted), rejected, cancelled or expired.
  @OnEvent("TravelBookingConfirmed")
  @OnEvent("TravelBookingPaymentRequired")
  async onStayAccepted(payload: { bookingId: string; from?: string }) {
    if (payload.from && payload.from !== "AWAITING_PROVIDER") return;
    await this.tasks.resolve(approvalTaskKey.stay(payload.bookingId), "بسته شد: میزبان درخواست را پذیرفت.");
  }

  @OnEvent("TravelBookingRejected")
  async onStayRejected(payload: { bookingId: string }) {
    await this.tasks.resolve(approvalTaskKey.stay(payload.bookingId), "بسته شد: میزبان درخواست را رد کرد.");
  }

  @OnEvent("TravelBookingExpired")
  async onStayExpired(payload: { bookingId: string }) {
    await this.tasks.resolve(approvalTaskKey.stay(payload.bookingId), "بسته شد: مهلت پاسخ به درخواست تمام شد.");
  }

  @OnEvent("TravelBookingCancelled")
  async onStayCancelled(payload: { bookingId: string }) {
    await this.tasks.resolve(approvalTaskKey.stay(payload.bookingId), "بسته شد: رزرو لغو شد.");
  }

  /** A held order cancelled by the member (or rejected by staff) needs no approval any more. */
  @OnEvent("OrderCancelled")
  async onOrderCancelled(payload: { orderId: string }) {
    await this.tasks.resolve(approvalTaskKey.order(payload.orderId), "بسته شد: سفارش لغو و مبلغ بازگردانده شد.");
  }
}
