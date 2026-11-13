import { Module } from "@nestjs/common";
import { ProvidersModule } from "../providers/providers.module";
import { BookingModule } from "../booking/booking.module";
import { AddressesModule } from "../addresses/addresses.module";
import { DiscoveryController } from "./discovery.controller";
import { DiscoveryService } from "./discovery.service";

@Module({
  imports: [ProvidersModule, BookingModule, AddressesModule],
  controllers: [DiscoveryController],
  providers: [DiscoveryService],
})
export class DiscoveryModule {}
