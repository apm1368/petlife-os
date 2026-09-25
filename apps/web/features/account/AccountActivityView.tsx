"use client";
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { EmptyState, Skeleton } from "@petlife/ui";
import { accountService, type ActivityEventDto } from "@/services/account.service";
import { AccountPageHeader } from "./AccountNav";

export function AccountActivityView() {
  const locale = useLocale(); const [events, setEvents] = useState<ActivityEventDto[] | null>(null);
  useEffect(() => { void accountService.activity().then(setEvents).catch(() => setEvents([])); }, []);
  if (!events) return <Skeleton className="h-72 w-full" aria-label="loading" />;
  return <div className="account-stack"><AccountPageHeader eyebrow={locale === "fa" ? "تاریخچه" : "ACTIVITY"} title={locale === "fa" ? "فعالیت‌های حساب" : "Account activity"} description={locale === "fa" ? "رویدادهای مهم و قابل‌فهم، بدون نمایش جزئیات حساس داخلی." : "Important, understandable events without exposing sensitive internals."} />{events.length ? <div className="activity-list">{events.map((event) => <div key={event.id}><span></span><p><b>{label(event.type, locale)}</b><small>{new Intl.DateTimeFormat(locale,{dateStyle:"long",timeStyle:"short"}).format(new Date(event.occurredAt))}</small></p></div>)}</div> : <EmptyState title={locale === "fa" ? "هنوز فعالیتی ثبت نشده" : "No activity yet"} description={locale === "fa" ? "تغییرات مهم حساب در اینجا دیده می‌شوند." : "Important account changes will appear here."} />}</div>;
}
function label(type:string,locale:string){const fa:Record<string,string>={UserAuthenticated:"ورود به حساب",PasswordChanged:"تغییر رمز عبور",PasswordResetCompleted:"بازیابی رمز عبور",SessionRevoked:"قطع دسترسی یک دستگاه",OtherSessionsRevoked:"خروج از سایر دستگاه‌ها",ConsentChanged:"تغییر رضایت‌نامه",DataExportRequested:"درخواست خروجی داده",AccountDeletionRequested:"درخواست حذف حساب",HouseholdInvitationAccepted:"پذیرش دعوت خانواده",PetAccessGranted:"ایجاد دسترسی حیوان",PetAccessChanged:"تغییر دسترسی حیوان",PetAccessRevoked:"لغو دسترسی حیوان"};return locale==="fa"?(fa[type]||type):type.replace(/([A-Z])/g," $1").trim()}
