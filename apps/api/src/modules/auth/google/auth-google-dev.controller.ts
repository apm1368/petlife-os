import { Body, Controller, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IsBoolean, IsOptional, IsString } from "class-validator";
import type { Request, Response } from "express";
import type { AppEnv } from "../../../config/env";
import { GoogleAuthDisabledException } from "../../../common/errors/api-exception";
import { AuthGoogleService } from "./auth-google.service";

class SimulateGoogleLoginDto {
  @IsString()
  sub!: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;

  @IsOptional()
  @IsString()
  name?: string;
}

/**
 * Dev/test-only equivalent of the real /auth/google/callback: skips the
 * network round trip to Google and the id_token verification entirely (there
 * is no honest way to simulate a real third party's signature), and instead
 * hands AuthGoogleService an already-"verified" profile directly — mirroring
 * every other dev/simulate endpoint in this codebase (see
 * NotificationDevController, MarketplaceDevController) that drives the real
 * downstream pipeline rather than faking its output. Returns JSON (not a
 * redirect) since this exists for supertest-driven e2e tests, not a browser.
 */
@Controller("dev/auth/google")
export class AuthGoogleDevController {
  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly authGoogle: AuthGoogleService,
  ) {}

  private assertDevAllowed(): void {
    if (this.config.get("NODE_ENV", { infer: true }) === "production") throw new GoogleAuthDisabledException();
  }

  @Post("simulate")
  async simulate(@Body() dto: SimulateGoogleLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertDevAllowed();
    const user = await this.authGoogle.signIn(
      {
        sub: dto.sub,
        email: dto.email ?? null,
        emailVerified: dto.emailVerified ?? true,
        name: dto.name ?? null,
        picture: null,
      },
      res,
      { userAgent: req.headers["user-agent"], ipAddress: req.ip },
    );
    return { user };
  }
}
