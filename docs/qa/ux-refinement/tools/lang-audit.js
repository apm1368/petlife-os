// FA/EN language purity + layout audit against the SERVER preview (never localhost).
// For each canonical route (canonical-routes.json: [email|"-", path, name]) in fa and en:
//  - UI chrome text (buttons, links in nav/tabs, labels, legends, table headers, headings, status pills,
//    options, placeholders, aria-labels, titles) — fa: Latin words not in the brand allowlist + Latin
//    digits; en: any Arabic-script character. User content (paragraph bodies, names inside lists) is not
//    chrome and is ignored, so QA data in Persian doesn't flag EN pages.
//  - overflow, page errors, system state.
//   WIDTHS=1440,390 ONLY=regex SHOTS=dir node lang-audit.js > out.json
const { chromium } = require("playwright");
const fs = require("fs");
const { createHmac } = require("crypto");
const { PrismaClient } = require(process.env.PRISMA_CLIENT);
const BASE = process.env.BASE || "http://185.231.112.154:8088";
const ALLOW = /^(PET|LIFE|OS|FA|EN|IRR|PDF|SMS|OTP|QR|AI|ID|PL|BK|Apoquel|CBC|kg|mg|ml)$/i;

(async () => {
  const db = new PrismaClient();
  const routes = JSON.parse(fs.readFileSync(process.env.ROUTES || "/opt/petlife-qa/canonical-routes.json", "utf8")).filter((r) => !process.env.ONLY || new RegExp(process.env.ONLY).test(r[2]));
  const widths = (process.env.WIDTHS || "1440").split(",").map(Number);
  const sessions = {};
  const cookieFor = async (email) => {
    if (email === "-") return [];
    if (!sessions[email]) {
      const u = (await db.$queryRawUnsafe(`select id::text id from users where email='${email}'`))[0];
      const s = await db.session.create({ data: { userId: u.id, expiresAt: new Date(Date.now() + 3600e3) } });
      sessions[email] = `${s.id}.${createHmac("sha256", process.env.SESSION_SECRET).update(s.id).digest("hex")}`;
    }
    return [{ name: "petlife_session", value: sessions[email], domain: new URL(BASE).hostname, path: "/" }];
  };
  if (process.env.SHOTS) fs.mkdirSync(process.env.SHOTS, { recursive: true });
  const b = await chromium.launch();
  const out = [];
  for (const locale of (process.env.LOCALES || "fa,en").split(",")) for (const width of widths) for (const [email, path, name] of routes) {
    const ctx = await b.newContext({ viewport: { width, height: 900 }, httpCredentials: { username: "petlife", password: process.env.BASIC_AUTH_PASSWORD } });
    await ctx.addCookies(await cookieFor(email));
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message.slice(0, 140)));
    try { await p.goto(`${BASE}/${locale}${path}`, { waitUntil: "networkidle", timeout: 45000 }); } catch (e) { errors.push("goto " + e.message.slice(0, 80)); }
    await p.waitForTimeout(900);
    const r = await p.evaluate(({ fa, allow }) => {
      const ALLOW = new RegExp(allow, "i");
      const chrome = 'button, [role=button], [role=tab], nav a, label, legend, th, h1, h2, h3, h4, summary, option, [class*="status"], [class*="badge"], [class*="pill"], dt';
      const issues = new Set();
      const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
      const check = (text, where) => {
        const t = (text || "").replace(/PET LIFE Care/g, "").replace(/\([A-Z]{2,5}\)/g, "").replace(/\s+/g, " ").trim();
        if (!t) return;
        if (fa) {
          const latin = (t.match(/[A-Za-z][A-Za-z_]{1,}/g) || []).filter((w) => !ALLOW.test(w));
          if (latin.length) issues.add(`latin [${where}] ${t.slice(0, 70)}`);
          if (/(^|[^A-Za-z#\-_.\/])\d+([^A-Za-z]|$)/.test(t) && !/[A-Za-z]/.test(t)) issues.add(`latin-digits [${where}] ${t.slice(0, 50)}`);
        } else if (/[؀-ۿ]/.test(t)) issues.add(`persian [${where}] ${t.slice(0, 70)}`);
      };
      for (const el of document.querySelectorAll(chrome)) {
        if (!visible(el) || el.closest("[data-user-content]")) continue;
        // Text explicitly marked with its own language (e.g. a language switch naming "English" on a Persian
        // page) is intentional, accessible content — not contamination.
        const marked = el.closest("[lang]");
        if (marked && marked !== document.documentElement && marked.getAttribute("lang") !== document.documentElement.lang) continue;
        // only the element's own text (not nested data rows): direct text + short labels
        const txt = el.innerText ?? el.textContent ?? "";
        const own = el.matches("h1,h2,h3,h4") ? txt : txt.length < 80 ? txt : "";
        if (own) check(own, el.tagName.toLowerCase());
      }
      for (const el of document.querySelectorAll("[placeholder],[aria-label],[title]")) {
        if (!visible(el)) continue;
        for (const a of ["placeholder", "aria-label", "title"]) if (el.getAttribute(a)) check(el.getAttribute(a), a);
      }
      if (fa) {
        // Body text, not only chrome: any Latin digit in visible text outside LTR islands (codes, order
        // numbers, phone/IBAN fields are marked dir=ltr) and outside user content.
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const el = n.parentElement;
          if (!el || !/[0-9]/.test(n.nodeValue) || el.closest('[dir="ltr"],code,kbd,pre,script,style,[data-user-content],.sr-only') || !visible(el)) continue;
          const t = n.nodeValue.replace(/\s+/g, " ").trim();
          if (/^[A-Z]{1,4}-[A-Z0-9]+$/.test(t)) continue;
          issues.add(`body-digits [${el.tagName.toLowerCase()}] ${t.slice(0, 60)}`);
        }
        for (const el of document.querySelectorAll('input[type="file"]')) if (visible(el) && el.getBoundingClientRect().width > 4) issues.add("native-file-input (English browser UI)");
        for (const el of document.querySelectorAll('input[type="date"],input[type="datetime-local"],input[type="time"]')) if (visible(el)) issues.add(`native-${el.type}-input`);
      }
      return {
        issues: [...issues].slice(0, 40),
        overflow: document.documentElement.scrollWidth - innerWidth,
        dir: document.documentElement.dir,
        kind: document.querySelector("[data-kind]")?.getAttribute("data-kind") ?? null,
        fonts: [...new Set([...document.querySelectorAll("h1,button,input,p")].slice(0, 30).map((e) => getComputedStyle(e).fontFamily.split(",")[0].replace(/"/g, "")))],
      };
    }, { fa: locale === "fa", allow: ALLOW.source }).catch((e) => ({ issues: [], overflow: 0, dir: null, kind: null, fonts: [], evalError: String(e.message).slice(0, 120) }));
    if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/${locale}-${name}-${width}.png`, fullPage: true });
    out.push({ locale, width, name, path, ...r, errors });
    await ctx.close();
  }
  await b.close(); await db.$disconnect();
  process.stdout.write(JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
