import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter";
import { RequestIdMiddleware } from "./common/middleware/request-id.middleware";
import { CsrfMiddleware } from "./common/csrf/csrf.middleware";
import { CsrfGuard } from "./common/csrf/csrf.guard";
import { PrismaModule } from "./common/prisma/prisma.module";
import { RedisModule } from "./common/redis/redis.module";
import { SessionModule } from "./common/session/session.module";
import { DomainEventsModule } from "./common/events/domain-events.module";
import { validateEnv } from "./config/env";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { HouseholdsModule } from "./modules/households/households.module";
import { PetAccessModule } from "./modules/pet-access/pet-access.module";
import { PetsModule } from "./modules/pets/pets.module";
import { OnboardingModule } from "./modules/onboarding/onboarding.module";
import { HomeModule } from "./modules/home/home.module";
import { StorageModule } from "./modules/storage/storage.module";
import { PetHealthModule } from "./modules/health/health.module";
import { NutritionModule } from "./modules/nutrition/nutrition.module";
import { CareProfileModule } from "./modules/care-profile/care-profile.module";
import { ProvidersModule } from "./modules/providers/providers.module";
import { BookingModule } from "./modules/booking/booking.module";
import { CareCalendarModule } from "./modules/care-calendar/care-calendar.module";
import { ServicesModule } from "./modules/services/services.module";
import { AddressesModule } from "./modules/addresses/addresses.module";
import { ProviderOsModule } from "./modules/provider-os/provider-os.module";
import { SellerOsModule } from "./modules/seller-os/seller-os.module";
import { CatalogModule } from "./modules/commerce/catalog/catalog.module";
import { CartModule } from "./modules/commerce/cart/cart.module";
import { CheckoutModule } from "./modules/commerce/checkout/checkout.module";
import { PaymentsModule } from "./modules/commerce/payments/payments.module";
import { FinancingModule } from "./modules/commerce/financing/financing.module";
import { LedgerModule } from "./modules/commerce/ledger/ledger.module";
import { RefundsModule } from "./modules/commerce/refunds/refunds.module";
import { ReconciliationModule } from "./modules/commerce/reconciliation/reconciliation.module";
import { OrdersModule } from "./modules/commerce/orders/orders.module";
import { LogisticsModule } from "./modules/commerce/logistics/logistics.module";
import { MarketplaceModule } from "./modules/commerce/marketplace/marketplace.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
      // The e2e suite creates many users in quick succession from the same
      // "IP" (supertest has no real network layer); production rate limits
      // stay intact, only the test run bypasses them.
      skipIf: () => process.env.NODE_ENV === "test",
    }),
    PrismaModule,
    RedisModule,
    SessionModule,
    DomainEventsModule,
    HealthModule,
    AuthModule,
    UsersModule,
    HouseholdsModule,
    PetAccessModule,
    PetsModule,
    OnboardingModule,
    HomeModule,
    StorageModule,
    PetHealthModule,
    NutritionModule,
    CareProfileModule,
    ProvidersModule,
    BookingModule,
    CareCalendarModule,
    ServicesModule,
    AddressesModule,
    ProviderOsModule,
    SellerOsModule,
    CatalogModule,
    CartModule,
    CheckoutModule,
    PaymentsModule,
    FinancingModule,
    LedgerModule,
    RefundsModule,
    ReconciliationModule,
    OrdersModule,
    LogisticsModule,
    MarketplaceModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, CsrfMiddleware).forRoutes("*");
  }
}
