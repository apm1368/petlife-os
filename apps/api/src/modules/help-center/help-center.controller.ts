import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { LegalDocumentKind } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { NotFoundApiException } from "../../common/errors/api-exception";
import { HelpCenterService } from "./help-center.service";
import { LegalStatusService } from "./legal-status.service";
import { SupportEscalationService } from "./support-escalation.service";
import { EscalateDto, HelpVoteDto, ListHelpArticlesQueryDto, LocaleQueryDto, SearchHelpQueryDto } from "./dto/help-center.dto";

/** Maps the URL segment a person sees to the document kind, so a route never exposes the enum's internal spelling. */
const LEGAL_SLUGS: Record<string, LegalDocumentKind> = {
  terms: LegalDocumentKind.TERMS_OF_SERVICE,
  privacy: LegalDocumentKind.PRIVACY_POLICY,
  cookies: LegalDocumentKind.COOKIE_CONSENT,
  "community-guidelines": LegalDocumentKind.COMMUNITY_GUIDELINES,
  "animal-welfare": LegalDocumentKind.ANIMAL_WELFARE,
  "ai-and-safety": LegalDocumentKind.AI_AND_SAFETY,
  "payment-and-refund": LegalDocumentKind.PAYMENT_AND_REFUND,
  delivery: LegalDocumentKind.DELIVERY,
  "installment-help": LegalDocumentKind.INSTALLMENT_HELP,
  accessibility: LegalDocumentKind.ACCESSIBILITY,
};

/**
 * Public, anonymous-readable Help Center. Every read delegates to HelpCenterService, the only place the
 * "published only" predicate lives, so nothing here can leak a draft.
 */
@Controller("help")
export class PublicHelpController {
  constructor(private readonly help: HelpCenterService) {}

  @Get("categories")
  categories(@Query() q: LocaleQueryDto) {
    return this.help.listCategories(q.locale);
  }

  @Get("articles")
  articles(@Query() q: ListHelpArticlesQueryDto) {
    return this.help.listArticles(q.locale, { categorySlug: q.category, contextKey: q.contextKey, faqOnly: q.faq === "true" || q.faq === "1", limit: q.limit });
  }

  @Get("search")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  search(@Query() q: SearchHelpQueryDto) {
    return this.help.search(q.locale, q.q, q.limit);
  }

  @Get("articles/:slug")
  article(@Param("slug") slug: string, @Query() q: LocaleQueryDto) {
    return this.help.getArticle(q.locale, slug);
  }

  @Post("articles/:slug/vote")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  vote(@Param("slug") slug: string, @Query() q: LocaleQueryDto, @Body() dto: HelpVoteDto, @Req() req: Request) {
    return this.help.vote(q.locale, slug, dto.helpful, { ip: req.ip, userAgent: req.headers["user-agent"] });
  }
}

/** Public legal pages and the status page. No session: a person must be able to read the terms before they sign up. */
@Controller("legal")
export class PublicLegalController {
  constructor(private readonly legal: LegalStatusService) {}

  @Get()
  index(@Query() q: LocaleQueryDto) {
    return this.legal.listPublicIndex(q.locale);
  }

  @Get(":slug")
  document(@Param("slug") slug: string, @Query() q: LocaleQueryDto) {
    const kind = LEGAL_SLUGS[slug];
    if (!kind) throw new NotFoundApiException("LegalDocument");
    return this.legal.getPublicDocument(kind, q.locale);
  }
}

@Controller("status")
export class PublicStatusController {
  constructor(private readonly legal: LegalStatusService) {}

  @Get()
  status() {
    return this.legal.getPublicStatus();
  }

  @Get("incidents/:id")
  incident(@Param("id", ParseUUIDPipe) id: string) {
    return this.legal.getPublicIncident(id);
  }
}

/** The member's "reach a person" hand-off on one of their own tickets. */
@Controller("support/cases")
@UseGuards(SessionAuthGuard)
export class SupportEscalationController {
  constructor(private readonly escalations: SupportEscalationService) {}

  @Post(":id/escalate")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  escalate(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: EscalateDto) {
    return this.escalations.escalate(user.id, id, dto);
  }
}
