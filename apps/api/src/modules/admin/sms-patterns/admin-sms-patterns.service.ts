import { Injectable } from "@nestjs/common";
import { Locale } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  NotFoundApiException,
  SettingChangeConflictException,
  ValidationApiException,
} from "../../../common/errors/api-exception";
import { SmsPatternTemplateService } from "../../notifications/sms-pattern-template.service";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

type PatternInput = {
  displayName: string;
  farazPatternCode: string;
  bodyAttributeKey: string;
  isActive: boolean;
};

/** Admin mutation layer for SMS pattern bindings. It never stores a Faraz API key or the rendered SMS body. */
@Injectable()
export class AdminSmsPatternsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: SmsPatternTemplateService,
    private readonly audit: AdminAuditLogService,
  ) {}

  async list() {
    const rows = await this.prisma.smsPatternTemplate.findMany({
      orderBy: [{ key: "asc" }, { locale: "asc" }],
    });
    return rows.map((row) => this.toDto(row));
  }

  async create(actor: ResolvedAdminContext, key: string, locale: Locale, input: PatternInput) {
    this.assertKey(key);
    const clean = this.clean(input);
    const row = await this.prisma.smsPatternTemplate.create({
      data: { key, locale, ...clean, updatedByAdminId: actor.adminUserId },
    });
    await this.audit.record({
      adminUserId: actor.adminUserId,
      action: "sms_pattern.created",
      entityType: "SmsPatternTemplate",
      entityId: row.id,
      afterSummary: this.summary(row),
    });
    this.templates.invalidate(row.key, row.locale);
    return this.toDto(row);
  }

  async update(actor: ResolvedAdminContext, id: string, baseVersion: number, input: PatternInput) {
    const clean = this.clean(input);
    const row = await this.prisma.$transaction(async (tx) => {
      const current = await tx.smsPatternTemplate.findUnique({ where: { id } });
      if (!current) throw new NotFoundApiException("SmsPatternTemplate", { id });
      if (current.version !== baseVersion)
        throw new SettingChangeConflictException({ id, currentVersion: current.version });
      const next = await tx.smsPatternTemplate.update({
        where: { id },
        data: { ...clean, version: { increment: 1 }, updatedByAdminId: actor.adminUserId },
      });
      await this.audit.record({
        adminUserId: actor.adminUserId,
        action: "sms_pattern.updated",
        entityType: "SmsPatternTemplate",
        entityId: id,
        beforeSummary: this.summary(current),
        afterSummary: this.summary(next),
        tx,
      });
      return next;
    });
    this.templates.invalidate(row.key, row.locale);
    return this.toDto(row);
  }

  private assertKey(key: string) {
    if (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(key))
      throw new ValidationApiException({ field: "key", reason: "INVALID_SMS_PATTERN_KEY" });
  }

  private clean(input: PatternInput): PatternInput {
    const displayName = input.displayName?.trim();
    const farazPatternCode = input.farazPatternCode?.trim();
    const bodyAttributeKey = input.bodyAttributeKey?.trim();
    if (!displayName || displayName.length > 140)
      throw new ValidationApiException({ field: "displayName", reason: "LENGTH" });
    if (!farazPatternCode || !/^[A-Za-z0-9_-]{1,128}$/.test(farazPatternCode))
      throw new ValidationApiException({ field: "farazPatternCode", reason: "INVALID_PATTERN_CODE" });
    if (!bodyAttributeKey || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(bodyAttributeKey))
      throw new ValidationApiException({ field: "bodyAttributeKey", reason: "INVALID_ATTRIBUTE_KEY" });
    if (typeof input.isActive !== "boolean")
      throw new ValidationApiException({ field: "isActive", reason: "BOOLEAN_REQUIRED" });
    return { displayName, farazPatternCode, bodyAttributeKey, isActive: input.isActive };
  }

  private summary(row: {
    key: string;
    locale: Locale;
    displayName: string;
    farazPatternCode: string;
    bodyAttributeKey: string;
    isActive: boolean;
    version: number;
  }) {
    return {
      key: row.key,
      locale: row.locale,
      displayName: row.displayName,
      farazPatternCode: row.farazPatternCode,
      bodyAttributeKey: row.bodyAttributeKey,
      isActive: row.isActive,
      version: row.version,
    };
  }

  private toDto(row: {
    id: string;
    key: string;
    locale: Locale;
    displayName: string;
    farazPatternCode: string;
    bodyAttributeKey: string;
    isActive: boolean;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      key: row.key,
      locale: row.locale,
      displayName: row.displayName,
      farazPatternCode: row.farazPatternCode,
      bodyAttributeKey: row.bodyAttributeKey,
      isActive: row.isActive,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
