import { Injectable } from "@nestjs/common";
import { ArticleLifecycleStatus, Locale, Prisma, ProductStatus, SupportNeedStatus, TravelListingStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";

export const SEARCH_TYPES = ["PROVIDER", "SERVICE", "PRODUCT", "TRAVEL_LISTING", "PLACE", "ARTICLE", "SUPPORT_NEED", "ORGANIZATION"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];
export const RECENT_TYPES = ["PROVIDER", "SERVICE", "PRODUCT", "TRAVEL_LISTING", "PLACE", "ARTICLE", "SUPPORT_NEED"] as const;
export type RecentType = (typeof RECENT_TYPES)[number];

type Preview = { title: string; subtitle: string | null; deepLink: string };
const LIVE_NEEDS: SupportNeedStatus[] = [SupportNeedStatus.PUBLISHED, SupportNeedStatus.PARTIALLY_FULFILLED];
const articleLink = (slug: string, categorySlug?: string | null) => (categorySlug === "guides" ? `/guides/${slug}` : `/blog/${slug}`);

/**
 * Consumer read surfaces over public catalogue data only:
 * - one "saved" list across the existing per-domain favorites/bookmarks (storage stays where it is);
 * - one search across public providers, services, products, stays, places, articles, needs and organisations;
 * - recently viewed public items (reported by the client), clearable.
 * Never touched: health, care, memories, orders, chat, support cases, admin, clinic CRM or private documents.
 */
@Injectable()
export class ConsumerHubService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- saved

  async saved(userId: string) {
    const [places, providers, products, stays, needs, posts] = await Promise.all([
      this.prisma.petFriendlyPlaceFavorite.findMany({ where: { userId, place: { isPubliclyListed: true } }, include: { place: { select: { id: true, name: true, city: true } } }, take: 100 }),
      this.prisma.providerFavorite.findMany({ where: { userId, providerOrganization: { verificationStatus: "VERIFIED" } }, include: { providerOrganization: { select: { id: true, name: true, type: true } } }, take: 100 }),
      this.prisma.productFavorite.findMany({ where: { userId, product: { status: ProductStatus.ACTIVE } }, include: { product: { select: { id: true, title: true } } }, take: 100 }),
      this.prisma.travelListingFavorite.findMany({ where: { userId, listing: { status: TravelListingStatus.PUBLISHED, isPubliclyListed: true } }, include: { listing: { select: { id: true, title: true, city: true } } }, take: 100 }),
      this.prisma.supportNeedBookmark.findMany({ where: { userId, listing: { status: { in: [...LIVE_NEEDS, SupportNeedStatus.FULFILLED, SupportNeedStatus.PAUSED] } } }, include: { listing: { select: { id: true, title: true, city: true } } }, take: 100 }),
      this.prisma.communityPostBookmark.findMany({ where: { userId, post: { status: "PUBLISHED" } }, include: { post: { select: { id: true, title: true, body: true } } }, take: 100 }),
    ]);
    const items = [
      ...places.map((f) => ({ type: "PLACE", id: f.place.id, savedAt: f.createdAt, preview: { title: f.place.name, subtitle: f.place.city, deepLink: `/places/${f.place.id}` } })),
      ...providers.map((f) => ({ type: "PROVIDER", id: f.providerOrganization.id, savedAt: f.createdAt, preview: { title: f.providerOrganization.name, subtitle: f.providerOrganization.type, deepLink: `/providers/${f.providerOrganization.id}` } })),
      ...products.map((f) => ({ type: "PRODUCT", id: f.product.id, savedAt: f.createdAt, preview: { title: f.product.title, subtitle: null, deepLink: `/shop/products/${f.product.id}` } })),
      ...stays.map((f) => ({ type: "TRAVEL_LISTING", id: f.listing.id, savedAt: f.createdAt, preview: { title: f.listing.title, subtitle: f.listing.city, deepLink: `/travel/stays/${f.listing.id}` } })),
      ...needs.map((f) => ({ type: "SUPPORT_NEED", id: f.listing.id, savedAt: f.createdAt, preview: { title: f.listing.title, subtitle: f.listing.city, deepLink: `/animal-support/needs/${f.listing.id}` } })),
      ...posts.map((f) => ({ type: "POST", id: f.post.id, savedAt: f.createdAt, preview: { title: f.post.title ?? f.post.body.slice(0, 80), subtitle: null, deepLink: `/community/posts/${f.post.id}` } })),
    ];
    return items.sort((a, b) => b.savedAt.getTime() - a.savedAt.getTime()).map((i) => ({ ...i, savedAt: i.savedAt.toISOString() }));
  }

  // ---------------------------------------------------------------- search

  async search(input: { q: string; types?: SearchType[]; city?: string; locale: Locale; limit?: number }) {
    const q = input.q.trim();
    if (q.length < 2) throw new ValidationApiException({ field: "q", reason: "MIN_2_CHARS" });
    const take = Math.min(Math.max(input.limit ?? 5, 1), 20);
    const want = (t: SearchType) => !input.types?.length || input.types.includes(t);
    const like = { contains: q, mode: "insensitive" as const };
    const city = input.city?.trim() ? { equals: input.city.trim(), mode: "insensitive" as const } : undefined;
    const groups = await Promise.all([
      want("PROVIDER")
        ? this.prisma.providerOrganization.findMany({ where: { verificationStatus: "VERIFIED", name: like, ...(city ? { locations: { some: { city } } } : {}) }, select: { id: true, name: true, type: true }, take }).then((r) => r.map((p) => this.hit("PROVIDER", p.id, { title: p.name, subtitle: p.type, deepLink: `/providers/${p.id}` })))
        : [],
      want("SERVICE")
        ? this.prisma.providerService.findMany({ where: { isActive: true, name: like, providerOrganization: { verificationStatus: "VERIFIED" }, ...(city ? { location: { city } } : {}) }, select: { id: true, name: true, category: true, providerOrganizationId: true, providerOrganization: { select: { name: true } } }, take }).then((r) => r.map((s) => this.hit("SERVICE", s.id, { title: s.name, subtitle: s.providerOrganization.name, deepLink: `/providers/${s.providerOrganizationId}` }, { category: s.category })))
        : [],
      want("PRODUCT")
        ? this.prisma.product.findMany({ where: { status: ProductStatus.ACTIVE, title: like }, select: { id: true, title: true }, take }).then((r) => r.map((p) => this.hit("PRODUCT", p.id, { title: p.title, subtitle: null, deepLink: `/shop/products/${p.id}` })))
        : [],
      want("TRAVEL_LISTING")
        ? this.prisma.travelListing.findMany({ where: { status: TravelListingStatus.PUBLISHED, isPubliclyListed: true, title: like, ...(city ? { city } : {}) }, select: { id: true, title: true, city: true }, take }).then((r) => r.map((l) => this.hit("TRAVEL_LISTING", l.id, { title: l.title, subtitle: l.city, deepLink: `/travel/stays/${l.id}` })))
        : [],
      want("PLACE")
        ? this.prisma.petFriendlyPlace.findMany({ where: { isPubliclyListed: true, name: like, ...(city ? { city } : {}) }, select: { id: true, name: true, city: true, fencedArea: true, entryFeeIrr: true }, take }).then((r) => r.map((p) => this.hit("PLACE", p.id, { title: p.name, subtitle: p.city, deepLink: `/places/${p.id}` }, { fencedArea: p.fencedArea, free: p.entryFeeIrr === 0 })))
        : [],
      want("ARTICLE")
        ? this.prisma.articleLocale.findMany({ where: { locale: input.locale, status: ArticleLifecycleStatus.VISIBLE, OR: [{ title: like }, { excerpt: like }] }, select: { articleId: true, slug: true, title: true, article: { select: { category: { select: { locales: { where: { locale: input.locale }, select: { slug: true } } } } } } }, take }).then((r) => r.map((a) => this.hit("ARTICLE", a.articleId, { title: a.title, subtitle: null, deepLink: articleLink(a.slug, a.article.category?.locales[0]?.slug) })))
        : [],
      want("SUPPORT_NEED")
        ? this.prisma.supportNeedListing.findMany({ where: { status: { in: LIVE_NEEDS }, title: like, ...(city ? { city } : {}) }, select: { id: true, title: true, city: true }, take }).then((r) => r.map((n) => this.hit("SUPPORT_NEED", n.id, { title: n.title, subtitle: n.city, deepLink: `/animal-support/needs/${n.id}` })))
        : [],
      want("ORGANIZATION")
        ? this.prisma.animalSupportOrganization.findMany({ where: { verificationStatus: "VERIFIED", isPubliclyListed: true, name: like }, select: { id: true, name: true }, take }).then((r) => r.map((o) => this.hit("ORGANIZATION", o.id, { title: o.name, subtitle: null, deepLink: `/animal-support/organizations/${o.id}` })))
        : [],
    ]);
    const results = groups.flat();
    return { q, total: results.length, results, counts: Object.fromEntries(SEARCH_TYPES.map((t) => [t, results.filter((r) => r.type === t).length])) };
  }

  private hit(type: SearchType, id: string, preview: Preview, facets: Record<string, unknown> = {}) {
    return { type, id, preview, facets };
  }

  // ---------------------------------------------------------------- recently viewed

  /** Records a view of a public item (idempotent per item; refreshes the time). Private kinds are not accepted. */
  async recordView(userId: string, entityType: RecentType, entityId: string) {
    if (!(await this.isPublic(entityType, entityId))) throw new NotFoundApiException("Item");
    await this.prisma.recentlyViewed.upsert({ where: { userId_entityType_entityId: { userId, entityType, entityId } }, create: { userId, entityType, entityId }, update: { viewedAt: new Date() } });
    // Keep the history bounded.
    const stale = await this.prisma.recentlyViewed.findMany({ where: { userId }, orderBy: { viewedAt: "desc" }, skip: 50, select: { entityType: true, entityId: true } });
    if (stale.length) await this.prisma.recentlyViewed.deleteMany({ where: { userId, OR: stale.map((s) => ({ entityType: s.entityType, entityId: s.entityId })) } });
    return { recorded: true };
  }

  /** Only items that are still public are returned. */
  async recentlyViewed(userId: string, locale: Locale) {
    const rows = await this.prisma.recentlyViewed.findMany({ where: { userId }, orderBy: { viewedAt: "desc" }, take: 30 });
    const out = [];
    for (const r of rows) {
      const preview = await this.previewOf(r.entityType as RecentType, r.entityId, locale);
      if (preview) out.push({ type: r.entityType, id: r.entityId, viewedAt: r.viewedAt.toISOString(), preview });
    }
    return out;
  }

  async clearRecentlyViewed(userId: string) {
    const done = await this.prisma.recentlyViewed.deleteMany({ where: { userId } });
    return { cleared: done.count };
  }

  private async isPublic(type: RecentType, id: string) {
    return Boolean(await this.previewOf(type, id, Locale.fa, true));
  }

  private async previewOf(type: RecentType, id: string, locale: Locale, anyLocale = false): Promise<Preview | null> {
    switch (type) {
      case "PROVIDER": {
        const p = await this.prisma.providerOrganization.findFirst({ where: { id, verificationStatus: "VERIFIED" }, select: { name: true, type: true } });
        return p ? { title: p.name, subtitle: p.type, deepLink: `/providers/${id}` } : null;
      }
      case "SERVICE": {
        const sv = await this.prisma.providerService.findFirst({ where: { id, isActive: true, providerOrganization: { verificationStatus: "VERIFIED" } }, select: { name: true, providerOrganizationId: true, providerOrganization: { select: { name: true } } } });
        return sv ? { title: sv.name, subtitle: sv.providerOrganization.name, deepLink: `/providers/${sv.providerOrganizationId}` } : null;
      }
      case "PRODUCT": {
        const p = await this.prisma.product.findFirst({ where: { id, status: ProductStatus.ACTIVE }, select: { title: true } });
        return p ? { title: p.title, subtitle: null, deepLink: `/shop/products/${id}` } : null;
      }
      case "TRAVEL_LISTING": {
        const l = await this.prisma.travelListing.findFirst({ where: { id, status: TravelListingStatus.PUBLISHED, isPubliclyListed: true }, select: { title: true, city: true } });
        return l ? { title: l.title, subtitle: l.city, deepLink: `/travel/stays/${id}` } : null;
      }
      case "PLACE": {
        const p = await this.prisma.petFriendlyPlace.findFirst({ where: { id, isPubliclyListed: true }, select: { name: true, city: true } });
        return p ? { title: p.name, subtitle: p.city, deepLink: `/places/${id}` } : null;
      }
      case "SUPPORT_NEED": {
        const n = await this.prisma.supportNeedListing.findFirst({ where: { id, status: { in: [...LIVE_NEEDS, SupportNeedStatus.FULFILLED, SupportNeedStatus.PAUSED] } }, select: { title: true, city: true } });
        return n ? { title: n.title, subtitle: n.city, deepLink: `/animal-support/needs/${id}` } : null;
      }
      case "ARTICLE": {
        const where: Prisma.ArticleLocaleWhereInput = { articleId: id, status: ArticleLifecycleStatus.VISIBLE, ...(anyLocale ? {} : { locale }) };
        const a = await this.prisma.articleLocale.findFirst({ where, select: { slug: true, title: true, locale: true, article: { select: { category: { select: { locales: { select: { slug: true, locale: true } } } } } } } });
        if (!a) return null;
        return { title: a.title, subtitle: null, deepLink: articleLink(a.slug, a.article.category?.locales.find((l) => l.locale === a.locale)?.slug) };
      }
    }
  }
}
