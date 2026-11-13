import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Type } from "class-transformer";
import { IsLatitude, IsLongitude, IsOptional, IsString, Length } from "class-validator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { MapsService, type MapsClientConfig, type PlaceResult } from "./maps.service";

class SearchQueryDto {
  @IsString() @Length(2, 100) q!: string;
  @IsOptional() @Type(() => Number) @IsLatitude() lat?: number;
  @IsOptional() @Type(() => Number) @IsLongitude() lng?: number;
}

/** Which map the web should draw, and place search for signed-in members (it spends the provider's quota). */
@Controller("maps")
export class MapsController {
  constructor(private readonly maps: MapsService) {}

  @Get("config")
  config(): MapsClientConfig {
    return this.maps.clientConfig();
  }

  @Get("search")
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  search(@Query() query: SearchQueryDto): Promise<PlaceResult[]> {
    return this.maps.search(query.q, query.lat != null && query.lng != null ? { latitude: query.lat, longitude: query.lng } : undefined);
  }
}
