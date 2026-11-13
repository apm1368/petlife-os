/** Branded transactional email layout. Inline styles only (mail clients ignore <style>), RTL for Persian and Arabic. */
export type EmailLocale = "fa" | "en" | "de" | "es" | "ar" | "nl";

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const FOOTER: Record<EmailLocale, string> = {
  fa: "این پیام را اپت‌لایف برای حساب شما فرستاده است. اگر انتظارش را نداشتید، می‌توانید آن را نادیده بگیرید.",
  en: "opetlife sent this message to your account. If you did not expect it, you can ignore it.",
  de: "opetlife hat diese Nachricht an Ihr Konto gesendet. Wenn Sie sie nicht erwartet haben, können Sie sie ignorieren.",
  es: "opetlife envió este mensaje a tu cuenta. Si no lo esperabas, puedes ignorarlo.",
  ar: "أرسلت opetlife هذه الرسالة إلى حسابك. إذا لم تكن تتوقعها، يمكنك تجاهلها.",
  nl: "opetlife heeft dit bericht naar je account gestuurd. Had je het niet verwacht? Dan kun je het negeren.",
};

export function renderEmail(input: { locale: EmailLocale; title: string; body: string; action?: { label: string; url: string } | null }) {
  const rtl = input.locale === "fa" || input.locale === "ar";
  const dir = rtl ? "rtl" : "ltr";
  const align = rtl ? "right" : "left";
  const font = rtl ? "Vazirmatn, Tahoma, Arial, sans-serif" : "Inter, Segoe UI, Arial, sans-serif";
  const paragraphs = input.body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.9;color:#33403a;font-size:15px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  const button = input.action
    ? `<p style="margin:22px 0 6px"><a href="${escapeHtml(input.action.url)}" style="display:inline-block;padding:12px 26px;border-radius:999px;background:#1f5a3d;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px">${escapeHtml(input.action.label)}</a></p>`
    : "";
  const html = `<!doctype html><html lang="${input.locale}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title></head>
<body style="margin:0;padding:0;background:#f5f1e8">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1e8;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffdf9;border-radius:24px;border:1px solid #e9e1d2;font-family:${font};direction:${dir};text-align:${align}">
<tr><td style="padding:24px 28px 0"><span style="display:inline-block;font-weight:800;font-size:20px;color:#1f5a3d">${input.locale === "fa" ? "اپت لایف" : "opetlife"}</span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f2b544;margin-${rtl ? "right" : "left"}:6px"></span></td></tr>
<tr><td style="padding:18px 28px 8px"><h1 style="margin:0 0 14px;font-size:20px;line-height:1.6;color:#1b201c">${escapeHtml(input.title)}</h1>${paragraphs}${button}</td></tr>
<tr><td style="padding:18px 28px 26px;border-top:1px solid #efe8db"><p style="margin:0;font-size:12px;line-height:1.8;color:#7a817a">${FOOTER[input.locale]}</p></td></tr>
</table></td></tr></table></body></html>`;
  const text = `${input.title}\n\n${input.body}${input.action ? `\n\n${input.action.label}: ${input.action.url}` : ""}\n\n— ${input.locale === "fa" ? "اپت لایف" : "opetlife"}`;
  return { html, text };
}

/** First https origin from WEB_APP_ORIGIN (comma-separated), falling back to the canonical site. */
export function publicOrigin(webAppOrigin: string | undefined): string {
  const origins = String(webAppOrigin ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  return origins.find((o) => o.startsWith("https://")) ?? origins[0] ?? "https://opetlife.ir";
}
