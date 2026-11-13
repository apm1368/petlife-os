import { Injectable } from "@nestjs/common";
import { AdminPriority, AdminTaskSource, type Prisma } from "@prisma/client";
import { AutomaticTaskService } from "../admin/task/automatic-task.service";
import { approvalTaskKey } from "./approval-policy";

const TEAM = "OPERATIONS";
const faNumber = (n: number) => new Intl.NumberFormat("fa-IR").format(n);

/**
 * Follow-up tasks for approvals (owner: «approvals go to the follow-up task list»). A booking or stay request still
 * waits on the partner's own accept/reject; the task lets staff chase it before it expires. A shop order held for
 * approval waits on staff, who approve or reject it from the order page. Every task closes itself when its subject
 * resolves (ApprovalTaskListener / OrderApprovalService), so the queue only holds work that is still open.
 * Titles are Persian like every other rule-generated task (the admin team works in fa).
 */
@Injectable()
export class ApprovalTaskService {
  constructor(private readonly tasks: AutomaticTaskService) {}

  raiseForServiceBooking(booking: { id: string; bookingNumber: string | null; serviceNameSnapshot: string | null; requestExpiresAt: Date | null; startAt: Date }, tx: Prisma.TransactionClient) {
    return this.tasks.raise(
      {
        dedupeKey: approvalTaskKey.serviceBooking(booking.id),
        title: `درخواست رزرو در انتظار پاسخ ارائه‌دهنده${booking.serviceNameSnapshot ? ` (${booking.serviceNameSnapshot})` : ""}`,
        description: `رزرو ${booking.bookingNumber ?? booking.id} تأیید ارائه‌دهنده را لازم دارد. اگر تا مهلت پاسخ نداد، با ارائه‌دهنده تماس بگیرید؛ با پذیرش، رد، لغو یا پایان مهلت این کار خودکار بسته می‌شود.`,
        source: AdminTaskSource.BOOKING_APPROVAL,
        team: TEAM,
        priority: AdminPriority.NORMAL,
        relatedEntityType: "Booking",
        relatedEntityId: booking.id,
        dueAt: booking.requestExpiresAt ?? booking.startAt,
      },
      tx,
    );
  }

  raiseForStay(booking: { id: string; reference: string; listingTitle: string; requestExpiresAt: Date | null; checkIn: Date }, tx: Prisma.TransactionClient) {
    return this.tasks.raise(
      {
        dedupeKey: approvalTaskKey.stay(booking.id),
        title: `درخواست اقامت در انتظار پاسخ میزبان (${booking.listingTitle})`,
        description: `رزرو اقامت ${booking.reference} تأیید میزبان را لازم دارد. اگر تا مهلت پاسخ نداد، با میزبان تماس بگیرید؛ با پذیرش، رد، لغو یا پایان مهلت این کار خودکار بسته می‌شود.`,
        source: AdminTaskSource.BOOKING_APPROVAL,
        team: TEAM,
        priority: AdminPriority.NORMAL,
        relatedEntityType: "TravelBooking",
        relatedEntityId: booking.id,
        dueAt: booking.requestExpiresAt ?? booking.checkIn,
      },
      tx,
    );
  }

  raiseForOrder(order: { id: string; orderNumber: string; sellerName: string; totalAmount: number }, tx: Prisma.TransactionClient) {
    return this.tasks.raise(
      {
        dedupeKey: approvalTaskKey.order(order.id),
        title: `سفارش ${order.orderNumber} در انتظار تأیید (${order.sellerName})`,
        description: `مبلغ ${faNumber(order.totalAmount)} ریال پرداخت شده است. سفارش را از صفحهٔ سفارش تأیید کنید تا به فروشنده برسد، یا با ذکر دلیل رد کنید تا کل مبلغ به مشتری برگردد.`,
        source: AdminTaskSource.ORDER_APPROVAL,
        team: TEAM,
        priority: AdminPriority.HIGH,
        relatedEntityType: "Order",
        relatedEntityId: order.id,
        dueAt: new Date(Date.now() + 86_400_000),
      },
      tx,
    );
  }

  resolve(dedupeKey: string, note?: string, tx?: Prisma.TransactionClient) {
    return this.tasks.resolve(dedupeKey, note, tx);
  }
}
