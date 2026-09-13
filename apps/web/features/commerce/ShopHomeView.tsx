"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Bone, ErrorRecovery, HeartPulse, PackageCheck, Search, ShoppingBag, Sparkles } from "@petlife/ui";
import type { ProductCategoryDto, ProductSummaryDto } from "@petlife/types";
import { useActivePet } from "@/hooks/use-active-pet";
import { isLocalPreview } from "@/lib/local-preview";
import { commerceService } from "@/services/commerce.service";
import { CinematicPageHero } from "@/features/experience/CinematicPageHero";

const CATEGORY_EXPERIENCE = [
  { id: "food", fa: "غذا و تشویقی", en: "Food & treats", hintFa: "تغذیه روزانه، رژیمی و درمانی", hintEn: "Everyday, diet and prescription nutrition", icon: Bone },
  { id: "health", fa: "سلامت و داروخانه", en: "Health & pharmacy", hintFa: "مکمل، بهداشت و نسخه دامپزشک", hintEn: "Supplements, wellness and vet prescriptions", icon: HeartPulse },
  { id: "care", fa: "مراقبت و زیبایی", en: "Care & grooming", hintFa: "پوست، مو، ناخن و نظافت", hintEn: "Coat, skin, nails and hygiene", icon: Sparkles },
  { id: "gear", fa: "لوازم و بازی", en: "Gear & play", hintFa: "قلاده، جای خواب و اسباب‌بازی", hintEn: "Walk gear, beds and toys", icon: ShoppingBag },
  { id: "repeat", fa: "ارسال دوره‌ای", en: "Repeat delivery", hintFa: "سبد تکرارشونده با زمان‌بندی منعطف", hintEn: "Flexible recurring delivery", icon: PackageCheck },
];

const PRODUCT_PREVIEW = [
  { id: "preview-1", titleFa: "غذای خشک سگ بالغ مونژه", titleEn: "Monge adult dog food", brand: "Monge", price: "۳٬۸۹۰٬۰۰۰ تومان", image: "/images/experience/shop-hero.png", position: "70% center" },
  { id: "preview-2", titleFa: "کنسرو گربه شسیر — مرغ و ژامبون", titleEn: "Schesir cat can — chicken", brand: "Schesir", price: "۲۸۵٬۰۰۰ تومان", image: "/images/landing/pet-portrait.png", position: "72% center" },
  { id: "preview-3", titleFa: "قلاده ضدکشش با بند ایمنی", titleEn: "Safety no-pull harness", brand: "PetSafe", price: "۱٬۴۵۰٬۰۰۰ تومان", image: "/images/landing/cookie-taxi.png", position: "58% center" },
  { id: "preview-4", titleFa: "باکس حمل مسافرتی استاندارد", titleEn: "Travel approved carrier", brand: "M-Pets", price: "۲٬۹۸۰٬۰۰۰ تومان", image: "/images/landing/cookie-world-day-clean.png", position: "54% center" },
  { id: "preview-5", titleFa: "شامپوی پوست حساس حیوانات", titleEn: "Sensitive skin pet shampoo", brand: "Biogance", price: "۷۹۰٬۰۰۰ تومان", image: "/images/experience/grooming-hero.png", position: "70% center" },
];

export function ShopHomeView() {
  const t = useTranslations("commerce.shopHome");
  const router = useRouter();
  const locale = useLocale();
  const fa = locale === "fa";
  const { activePet } = useActivePet();
  const [categories, setCategories] = useState<ProductCategoryDto[] | null>(null);
  const [products, setProducts] = useState<ProductSummaryDto[] | null>(null);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError(false);
    void Promise.all([commerceService.listCategories(), commerceService.searchProducts({ petId: activePet?.id })])
      .then(([nextCategories, nextProducts]) => { if (!cancelled) { setCategories(nextCategories); setProducts(nextProducts); } })
      .catch(() => { if (!cancelled && isLocalPreview()) { setPreview(true); setCategories([]); setProducts([]); } else if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [activePet?.id, retry]);

  const cards = useMemo(() => {
    const source = products?.length ? products.map((product, index) => ({ id: product.id, titleFa: product.title, titleEn: product.title, brand: product.brand?.name ?? (fa ? "فروشنده تاییدشده" : "Verified seller"), price: product.bestOffer ? `${product.bestOffer.priceAmount.toLocaleString(locale)} ${product.bestOffer.currency}` : (fa ? "ناموجود" : "Unavailable"), image: PRODUCT_PREVIEW[index % PRODUCT_PREVIEW.length]!.image, position: PRODUCT_PREVIEW[index % PRODUCT_PREVIEW.length]!.position })) : PRODUCT_PREVIEW;
    const normalized = query.trim().toLowerCase();
    return normalized ? source.filter((item) => `${item.titleFa} ${item.titleEn} ${item.brand}`.toLowerCase().includes(normalized)) : source;
  }, [fa, locale, products, query]);

  function submitSearch(event: React.FormEvent) { event.preventDefault(); if (query.trim()) router.push(`/${locale}/shop/products?q=${encodeURIComponent(query.trim())}`); }

  if (error) return <ErrorRecovery title={fa ? "فروشگاه در دسترس نیست" : "Shop unavailable"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={() => setRetry((value) => value + 1)} />;
  return <div className="experience-stack">
    <CinematicPageHero image="/images/experience/shop-hero.png" eyebrow={fa ? "فروشگاه انتخاب‌شده برای حیوانات" : "PET-FIRST CURATION"} title={fa ? "خریدی که از نیاز حیوان شروع می‌شود" : "Shopping that starts with your pet"} description={fa ? "محصول مناسب را با توجه به سن، جثه و نیازهای مراقبتی پیدا کنید؛ از مقایسه قیمت تا ارسال دوره‌ای." : "Find the right product by age, size and care needs—from price comparison to repeat delivery."}>
      <form className="experience-search" onSubmit={submitSearch} role="search"><label><Search size={20} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={fa ? "جست‌وجوی غذا، برند یا محصول…" : "Search food, brand or product…"} /></label><button type="submit">{fa ? "جست‌وجو" : "Search"}</button></form>
    </CinematicPageHero>
    {preview ? <p className="experience-preview-note">{fa ? "پیش‌نمایش طراحی با ۵ داده واقعی‌نما؛ قیمت، موجودی و سازگاری در نسخه متصل از API خوانده می‌شوند." : "Design preview with five realistic records; price, inventory and compatibility come from the connected API."}</p> : null}
    <section className="experience-section"><div className="experience-section__head"><div><h2>{t("categories")}</h2><p>{fa ? "مسیر کوتاه‌تر برای رسیدن به انتخاب درست" : "A shorter path to the right choice"}</p></div></div><div className="experience-grid experience-grid--five">
      {CATEGORY_EXPERIENCE.map((item, index) => { const apiCategory = categories?.[index]; const Icon = item.icon; return <button key={item.id} type="button" className="experience-tile" onClick={() => router.push(`/${locale}/shop/products?category=${apiCategory?.id ?? item.id}`)}><span className="experience-tile__icon"><Icon size={23} aria-hidden="true" /></span><div><h3>{apiCategory?.name ?? (fa ? item.fa : item.en)}</h3><p>{fa ? item.hintFa : item.hintEn}</p></div></button>; })}
    </div></section>
    <section className="experience-section"><div className="experience-section__head"><div><h2>{fa ? "پیشنهادهای امروز" : "Today’s picks"}</h2><p>{activePet ? t("subtitle", { name: activePet.name }) : (fa ? "محبوب‌ترین انتخاب‌های فروشگاه" : "Popular store picks")}</p></div></div><div className="experience-grid">
      {cards.slice(0, 6).map((product) => <button key={product.id} className="experience-card" type="button" onClick={() => router.push(`/${locale}/shop/products/${product.id}`)}><div className="experience-card__media"><Image src={product.image} alt="" fill sizes="(max-width: 600px) 100vw, 33vw" style={{ objectPosition: product.position }} /></div><div className="experience-card__body"><div className="experience-card__row"><span className="experience-badge"><PackageCheck size={14} aria-hidden="true" />{fa ? "موجود" : "In stock"}</span><span className="experience-badge experience-badge--gold">{product.brand}</span></div><h3 className="mt-3">{fa ? product.titleFa : product.titleEn}</h3><p>{fa ? "ارسال سریع · امکان بررسی سازگاری" : "Fast delivery · compatibility check"}</p><div className="experience-price">{product.price}</div></div></button>)}
    </div></section>
  </div>;
}
