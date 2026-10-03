"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@petlife/ui";
import type { SupportCampaignDto } from "@petlife/types";
import { formatCurrency } from "@/lib/currency/format-currency";
import { randomId } from "@/lib/id/random-id";
import { localizeDigits } from "@/lib/date/jalali";
import { animalSupportService } from "@/services/animal-support.service";
import { useSessionStore } from "@/stores/session-store";
import { apiErrorText } from "@/lib/errors/api-error-text";

const PRESETS_TOMAN = [100_000, 300_000, 500_000, 1_000_000];
type Step = "amount" | "review" | "done";

/**
 * DONATION PATTERN. Amounts are entered in Toman and sent as IRR (the ledger's unit). Donors are
 * anonymous unless they choose a public name. The review step says plainly where the money goes
 * (general vs restricted, and the need it is for) and whether the payment environment is a sandbox.
 * Success is only what the gateway reports; the receipt is private to the donor.
 */
export function DonationPanel({ campaign, need, onDonated }: { campaign: SupportCampaignDto; need?: { id: string; title: string } | null; onDonated?: () => void }) {
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const router = useRouter();
  const pathname = usePathname();
  const session = useSessionStore((s) => s.status);
  const [step, setStep] = useState<Step>("amount");
  const [toman, setToman] = useState("");
  const [publicly, setPublicly] = useState(false);
  const [publicName, setPublicName] = useState("");
  const [env, setEnv] = useState<{ mode: "sandbox" | "production"; onlinePaymentAvailable: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(() => randomId());
  const [result, setResult] = useState<{ id: string; status: string } | null>(null);

  useEffect(() => {
    animalSupportService.paymentEnvironment().then(setEnv).catch(() => setEnv(null));
  }, []);

  const amountIrr = Math.round(Number(toman || 0) * 10);
  const validAmount = amountIrr >= 10_000;
  const validName = !publicly || publicName.trim().length > 0;

  if (session !== "authenticated") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-body text-text-secondary">{fa ? "برای کمک مالی وارد حساب شوید؛ رسید فقط برای شما نمایش داده می‌شود." : "Sign in to donate; your receipt stays private to you."}</p>
        <Button variant="secondary" onClick={() => router.push(`/${lang}/welcome?returnTo=${encodeURIComponent(pathname)}`)}>{fa ? "ورود" : "Sign in"}</Button>
      </div>
    );
  }

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await animalSupportService.donate(campaign.id, { amountIrr, showDonorPublicly: publicly, publicDisplayName: publicly ? publicName.trim() : undefined, supportNeedListingId: need?.id, idempotencyKey: key });
      setResult({ id: res.donationIntentId, status: res.status });
      if (res.status === "SUCCEEDED") {
        setStep("done");
        onDonated?.();
      } else {
        setError(fa ? "درگاه پرداخت را ناموفق اعلام کرد؛ مبلغی کسر نشده است. می‌توانید دوباره تلاش کنید." : "The payment gateway reported a failure; nothing was charged. You can try again.");
        setKey(randomId());
      }
    } catch (e) {
      setError(apiErrorText(e, lang, fa ? "پرداخت انجام نشد." : "The payment did not go through."));
      setKey(randomId());
    } finally {
      setBusy(false);
    }
  };

  if (step === "done" && result) {
    return (
      <div role="status" className="flex flex-col gap-2">
        <p className="text-body text-state-success">{fa ? `سپاس! ${formatCurrency(amountIrr, "fa")} برای «${campaign.title}» ثبت شد.` : `Thank you! ${formatCurrency(amountIrr, "en")} was recorded for “${campaign.title}”.`}</p>
        <Link className="text-sm underline" href={`/${lang}/donations/${result.id}`}>{fa ? "مشاهدهٔ رسید" : "View receipt"}</Link>
      </div>
    );
  }

  const sandboxNote = env?.mode === "sandbox" ? (
    <p className="rounded-md bg-state-attention/10 p-3 text-sm text-state-attention">{fa ? "درگاه پرداخت در حالت آزمایشی است: هیچ پول واقعی جابه‌جا نمی‌شود و این کمک مالی فقط برای آزمایش ثبت می‌شود." : "The payment gateway is in sandbox mode: no real money moves and this donation is recorded for testing only."}</p>
  ) : null;

  if (env && !env.onlinePaymentAvailable) return <p className="text-sm text-text-secondary">{fa ? "پرداخت آنلاین در حال حاضر در دسترس نیست." : "Online payment is not available right now."}</p>;

  return (
    <div className="flex flex-col gap-4">
      {step === "amount" ? (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{fa ? "مبلغ (تومان)" : "Amount (Toman)"}</legend>
            <div className="flex flex-wrap gap-2">
              {PRESETS_TOMAN.map((v) => (
                <button key={v} type="button" aria-pressed={Number(toman) === v} onClick={() => setToman(String(v))} className={`min-h-11 rounded-full border px-4 text-sm ${Number(toman) === v ? "border-brand-natural bg-brand-solid/10" : "border-border-subtle"}`}>{localizeDigits(v.toLocaleString("en-US"), lang)}</button>
              ))}
            </div>
            <input aria-label={fa ? "مبلغ دلخواه به تومان" : "Custom amount in Toman"} inputMode="numeric" value={toman} onChange={(e) => setToman(e.target.value.replace(/\D/g, "").slice(0, 10))} className="min-h-12 rounded-md border border-border-subtle bg-surface-base px-3" placeholder={fa ? "مبلغ دلخواه" : "Other amount"} />
            {toman && !validAmount ? <span className="text-metadata text-state-urgent">{fa ? "حداقل ۱٬۰۰۰ تومان" : "At least 1,000 Toman"}</span> : null}
          </fieldset>
          <p className="text-sm text-text-secondary">
            {campaign.fundType === "RESTRICTED" ? (fa ? "این کمک «محدود» است: فقط برای هدف همین کارزار هزینه می‌شود." : "This is a restricted gift: it can only be spent on this campaign's purpose.") : fa ? "این کمک «عمومی» است: سازمان آن را برای نیازهای جاری حیوانات هزینه می‌کند." : "This is a general gift: the organization spends it on its animals' current needs."}
            {need ? (fa ? ` برای: «${need.title}»` : ` For: “${need.title}”`) : ""}
          </p>
          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="mb-1 font-medium">{fa ? "نمایش عمومی" : "Public display"}</legend>
            <label className="flex items-center gap-2"><input type="radio" name="vis" className="h-5 w-5" checked={!publicly} onChange={() => setPublicly(false)} />{fa ? "ناشناس (پیشنهادی)" : "Anonymous (recommended)"}</label>
            <label className="flex items-center gap-2"><input type="radio" name="vis" className="h-5 w-5" checked={publicly} onChange={() => setPublicly(true)} />{fa ? "با نامی که خودم انتخاب می‌کنم" : "With a name I choose"}</label>
            {publicly ? <input dir="auto" aria-label={fa ? "نام نمایشی" : "Display name"} maxLength={40} value={publicName} onChange={(e) => setPublicName(e.target.value)} placeholder={fa ? "مثلاً سارا، یا «یک دوست پناهگاه»" : "e.g. Sara, or “A friend of the shelter”"} className="min-h-11 rounded-md border border-border-subtle bg-surface-base px-3" /> : null}
            <span className="text-metadata text-text-secondary">{fa ? "نام حساب، شماره و ایمیل شما هرگز عمومی نمی‌شود." : "Your account name, phone and email are never shown publicly."}</span>
          </fieldset>
          <Button disabled={!validAmount || !validName} onClick={() => setStep("review")}>{fa ? "ادامه" : "Continue"}</Button>
        </>
      ) : (
        <>
          <dl className="flex flex-col gap-1 rounded-md bg-surface-subtle p-3 text-sm">
            <div className="flex justify-between gap-3"><dt>{fa ? "مبلغ" : "Amount"}</dt><dd className="font-bold tabular-nums">{formatCurrency(amountIrr, lang)}</dd></div>
            <div className="flex justify-between gap-3"><dt>{fa ? "به" : "To"}</dt><dd className="text-end">{campaign.organizationName} — {campaign.title}</dd></div>
            {need ? <div className="flex justify-between gap-3"><dt>{fa ? "برای" : "For"}</dt><dd className="text-end">{need.title}</dd></div> : null}
            <div className="flex justify-between gap-3"><dt>{fa ? "نوع" : "Type"}</dt><dd>{campaign.fundType === "RESTRICTED" ? (fa ? "محدود به این هدف" : "Restricted to this purpose") : fa ? "عمومی" : "General"}</dd></div>
            <div className="flex justify-between gap-3"><dt>{fa ? "نمایش" : "Shown as"}</dt><dd>{publicly ? publicName : fa ? "ناشناس" : "Anonymous"}</dd></div>
          </dl>
          {sandboxNote}
          <p className="text-metadata text-text-secondary">{fa ? "کمک مالی خرید نیست و قابل بازپرداخت خودکار نیست؛ در صورت مشکل با پشتیبانی تماس بگیرید." : "A donation is not a purchase and isn't refunded automatically; contact support if something went wrong."}</p>
          {error ? <p role="alert" className="text-sm text-state-urgent">{error}</p> : null}
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setStep("amount")}>{fa ? "قبلی" : "Back"}</Button>
            <Button className="flex-1" isLoading={busy} onClick={() => void pay()}>{fa ? `پرداخت ${formatCurrency(amountIrr, "fa")}` : `Pay ${formatCurrency(amountIrr, "en")}`}</Button>
          </div>
        </>
      )}
    </div>
  );
}
