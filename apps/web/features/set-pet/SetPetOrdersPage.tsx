"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Shirt } from "@petlife/ui";
import type { RouteLocale } from "@/lib/i18n/config";
import { SetPetOrders } from "./SetPetOrders";
import "./set-pet.css";

/** Orders → «ست پت»: the member's Set Pet orders in a section of their own (owner P38). */
export function SetPetOrdersPage({ focusId }: { focusId?: string }) {
  const t = useTranslations("setPet.orders");
  const locale = useLocale() as RouteLocale;
  return (
    <div className="setpet setpet--orders">
      <div className="setpet-orders__top">
        <h1>{t("pageTitle")}</h1>
        <Link className="opl-btn primary sm" href={`/${locale}/set-pet#setpet-builder`}><Shirt size={16} aria-hidden="true" />{t("new")}</Link>
      </div>
      <Link className="setpet-back" href={`/${locale}/orders`}>{t("allOrders")}</Link>
      <SetPetOrders focusId={focusId} />
    </div>
  );
}
