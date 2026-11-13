"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MapPin } from "@petlife/ui";
import Link from "@/features/navigation/localized-link";
import { addressesService } from "@/services/addresses.service";
import { householdsService } from "@/services/households.service";
import "./location-picker.css";

/**
 * "Pin your location" prompt for the member home. Self-contained: it loads the member's own address book and renders
 * nothing while loading, on any error, or once any address has a pin. No props.
 */
export function LocationNudge() {
  const t = useTranslations("locationNudge");
  const [show, setShow] = useState(false);
  useEffect(() => {
    let alive = true;
    householdsService
      .listMine()
      .then(async (households) => {
        const id = households[0]?.id;
        if (!id) return;
        const addresses = await addressesService.list(id);
        if (alive) setShow(!addresses.some((a) => a.latitude != null && a.longitude != null));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  if (!show) return null;
  return (
    <aside className="location-nudge" aria-label={t("text")}>
      <p>
        <MapPin size={16} aria-hidden /> {t("text")}
      </p>
      <Link href="/profile/addresses" className="underline">
        {t("action")}
      </Link>
    </aside>
  );
}
