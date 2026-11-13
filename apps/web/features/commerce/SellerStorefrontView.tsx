"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { PublicSellerStorefrontDto } from "@petlife/types";
import { BadgeCheck, MapPin, ShieldCheck, Star } from "@petlife/ui";
import type { RouteLocale } from "@/lib/i18n/config";
import { ProductCard } from "./ProductCard";
import { CommercePage } from "./CommercePage";
import { formatNumber } from "./commerce-ui";
import "./seller-storefront.css";

/** A verified seller's public page: who they are (no phone numbers), their rating from verified purchases, their products. */
export function SellerStorefrontView({ store }: { store: PublicSellerStorefrontDto }) {
  const t = useTranslations("sellerStorefront");
  const locale = useLocale() as RouteLocale;
  const router = useRouter();
  const { seller } = store;
  const since = new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale, { year: "numeric", month: "long" }).format(new Date(seller.memberSince));
  return (
    <CommercePage className="storefront">
      <header className="storefront__head">
        {seller.logoUrl ? (
          // Seller logos come from object storage; dimensions are fixed by CSS.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={seller.logoUrl} alt="" className="storefront__logo" />
        ) : (
          <span className="storefront__logo storefront__logo--initial" aria-hidden="true">
            {seller.name.slice(0, 1)}
          </span>
        )}
        <div className="storefront__intro">
          <h1>{seller.name}</h1>
          <p className="storefront__facts">
            <span className="storefront__badge">
              <BadgeCheck size={16} aria-hidden="true" /> {t("verified")}
            </span>
            {seller.city ? (
              <span>
                <MapPin size={14} aria-hidden="true" /> {t("city", { city: seller.city })}
              </span>
            ) : null}
            <span>{t("since", { date: since })}</span>
            <span>
              <Star size={14} aria-hidden="true" /> {seller.rating ? t("rating", { average: formatNumber(seller.rating.average, locale), count: seller.rating.count }) : t("noRating")}
            </span>
          </p>
          {seller.description ? <p className="storefront__description">{seller.description}</p> : null}
          <p className="storefront__protection">
            <ShieldCheck size={16} aria-hidden="true" /> {t("protection")}
          </p>
        </div>
      </header>
      <section aria-labelledby="storefront-products" className="storefront__products">
        <h2 id="storefront-products">{t("products", { count: store.total })}</h2>
        {store.products.length === 0 ? (
          <p className="storefront__empty">
            {t("empty")} <Link href={`/${locale}/shop`}>{t("backToShop")}</Link>
          </p>
        ) : (
          <div className="product-grid">
            {store.products.map((product) => (
              <ProductCard key={product.id} product={product} onClick={() => router.push(`/${locale}/shop/products/${product.id}`)} />
            ))}
          </div>
        )}
      </section>
    </CommercePage>
  );
}
