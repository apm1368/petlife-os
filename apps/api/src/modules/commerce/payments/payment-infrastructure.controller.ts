import { Body, Controller, Headers, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { IsString } from "class-validator";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import type { SessionUser } from "../../../common/session/session.service";
import { CardTransferPaymentService } from "./card-transfer-payment.service";
import { ZibalPaymentService } from "./zibal-payment.service";
import { WalletPaymentService } from "./wallet-payment.service";

class ReceiptDto { @IsString() receiptObjectKey!: string; }

/** Customer-facing endpoints only; payment controls/feature switches are P1-b. */
@Controller("payments")
@UseGuards(SessionAuthGuard)
export class PaymentInfrastructureController {
  constructor(private readonly zibal: ZibalPaymentService, private readonly cardTransfer: CardTransferPaymentService, private readonly wallet: WalletPaymentService) {}

  @Post("zibal/checkout/:checkoutId/initiate")
  initiateZibal(@CurrentUser() user: SessionUser, @Param("checkoutId", ParseUUIDPipe) checkoutId: string, @Headers("idempotency-key") idempotencyKey?: string) { return this.zibal.initiate(user.id, checkoutId, idempotencyKey); }

  /** Callback handlers should authenticate/signature-check at the edge; this route only verifies the provider's track id and remains idempotent. */
  @Post("zibal/verify/:trackId")
  verifyZibal(@Param("trackId") trackId: string) { return this.zibal.verify(trackId); }

  @Post("card-transfer/checkout/:checkoutId")
  startCardTransferCheckout(@CurrentUser() user: SessionUser, @Param("checkoutId", ParseUUIDPipe) checkoutId: string, @Headers("idempotency-key") idempotencyKey?: string) { return this.cardTransfer.startForCheckout(user.id, checkoutId, idempotencyKey ?? ""); }

  @Post("card-transfer/booking/:bookingId")
  startCardTransferBooking(@CurrentUser() user: SessionUser, @Param("bookingId", ParseUUIDPipe) bookingId: string, @Headers("idempotency-key") idempotencyKey?: string) { return this.cardTransfer.startForBooking(user.id, bookingId, idempotencyKey ?? ""); }

  @Post("card-transfer/:id/receipt")
  uploadReceipt(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ReceiptDto) { return this.cardTransfer.uploadReceipt(user.id, id, dto.receiptObjectKey); }

  @Post("wallet/checkout/:checkoutId")
  payWithWallet(@CurrentUser() user: SessionUser, @Param("checkoutId", ParseUUIDPipe) checkoutId: string, @Headers("idempotency-key") idempotencyKey?: string) { return this.wallet.payCheckout(user.id, checkoutId, idempotencyKey); }
}
