import { Body, Controller, Delete, Get, Param, Post, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Matches, Max, Min, ValidateNested } from "class-validator";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { ValidationApiException } from "../../../common/errors/api-exception";
import { requireIranianMobile } from "../../auth/identifier.util";
import { FARAZ_PATTERN_CATEGORIES, type FarazPatternCategory, type FarazPatternVarType } from "../../notifications/messaging/faraz-sms.client";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AdminSmsService } from "./admin-sms.service";

const PATTERN_CODE = /^[A-Za-z0-9_-]{1,64}$/;

class PatternVarDto {
  @IsString() @Matches(/^[A-Za-z][A-Za-z0-9_]{0,31}$/, { message: "variable names start with a letter and use letters, digits and _" }) var!: string;
  @IsInt() @Min(1) @Max(200) length!: number;
  @IsIn(["int", "str", "date"]) type!: FarazPatternVarType;
}

/** Mirrors FarazSMS POST /ws/v1/patterns. Variables appear in the text as %name%. */
class CreatePatternDto {
  @IsString() @Length(3, 1000) text!: string;
  @IsOptional() @IsString() @Length(0, 500) description?: string;
  @IsString() @Length(3, 255) website!: string;
  @IsBoolean() shared!: boolean;
  @IsIn(Object.keys(FARAZ_PATTERN_CATEGORIES)) category!: FarazPatternCategory;
  @ValidateNested({ each: true }) @Type(() => PatternVarDto) @ArrayMinSize(0) @ArrayMaxSize(20) vars!: PatternVarDto[];
}

class TestSendDto {
  @IsString() @Matches(PATTERN_CODE) code!: string;
  @IsString() @Length(10, 20) recipient!: string;
  @IsObject() attributes!: Record<string, string>;
}

@Controller("admin/sms")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminSmsController {
  constructor(private readonly sms: AdminSmsService) {}

  @Get("overview")
  @RequireAdminPermission("system.view")
  overview() { return this.sms.overview(); }

  @Get("lines")
  @RequireAdminPermission("system.view")
  lines() { return this.sms.lines(); }

  @Get("patterns")
  @RequireAdminPermission("system.view")
  patterns() { return this.sms.listPatterns(); }

  @Get("patterns/:code")
  @RequireAdminPermission("system.view")
  pattern(@Param("code") code: string) { return this.sms.getPattern(assertCode(code)); }

  @Post("patterns")
  @RequireAdminPermission("settings.manage")
  create(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: CreatePatternDto) {
    return this.sms.createPattern(admin, { text: dto.text, description: dto.description, website: dto.website, shared: dto.shared, category: dto.category, vars: dto.vars.map((v) => ({ var: v.var, length: v.length, type: v.type })) });
  }

  @Delete("patterns/:code")
  @RequireAdminPermission("settings.manage")
  remove(@CurrentAdmin() admin: ResolvedAdminContext, @Param("code") code: string) { return this.sms.deletePattern(admin, assertCode(code)); }

  @Post("test")
  @RequireAdminPermission("settings.manage")
  test(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: TestSendDto) {
    const attributes = Object.fromEntries(Object.entries(dto.attributes).map(([k, v]) => [k, String(v)]));
    return this.sms.testSend(admin, { code: dto.code, recipient: requireIranianMobile(dto.recipient, "recipient"), attributes });
  }
}

function assertCode(code: string): string {
  if (!PATTERN_CODE.test(code)) throw new ValidationApiException({ field: "code", reason: "Invalid pattern code." });
  return code;
}
