/**
 * ERP QA admin personas — one per internal role, so Codex and QA can see every admin surface as that role would.
 *
 *   cd apps/api && (set -a; . ./.env; set +a; PETLIFE_QA_SEED_DATABASE=petlife_os npx ts-node --transpile-only prisma/seed-qa-admins.ts)
 *
 * Accounts are `qa-admin-<role>@example.test` / username `qa.admin.<role>`. Passwords are random, stored ONLY in
 * /root/petlife-qa-admin-credentials.txt (mode 600) — never printed, never committed. Re-running keeps a stored
 * password that still verifies and only (re)generates missing ones. Never touches pedram / owner.review.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { AdminMembershipStatus, AdminRole, PrismaClient } from "@prisma/client";
import { hashPassword, verifyPassword } from "../src/common/password/password-hash.util";

const sid = (key: string) => { const h = createHash("sha1").update(`qa-erp:${key}`).digest("hex"); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
/** One-page PDF that says it is sample data — the only kind of "evidence" demo partners get. */
function demoPdf(text: string): Buffer {
  const stream = `BT /F1 11 Tf 40 780 Td (${text.replace(/[()\\]/g, "")}) Tj ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let body = "%PDF-1.4\n";
  const offsets = objects.map((o, i) => { const at = body.length; body += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

const FILE = process.env.QA_ADMIN_CREDENTIAL_FILE ?? "/root/petlife-qa-admin-credentials.txt";
const PERSONAS: { role: AdminRole; slug: string; name: string }[] = [
  { role: AdminRole.SUPER_ADMIN, slug: "super", name: "مدیر ارشد آزمون (QA)" },
  { role: AdminRole.ADMIN, slug: "admin", name: "مدیر آزمون (QA)" },
  { role: AdminRole.OPERATIONS, slug: "ops", name: "عملیات آزمون (QA)" },
  { role: AdminRole.SUPPORT, slug: "support", name: "پشتیبان آزمون (QA)" },
  { role: AdminRole.FINANCE, slug: "finance", name: "مالی آزمون (QA)" },
  { role: AdminRole.EDITOR, slug: "content", name: "ویراستار محتوای آزمون (QA)" },
  { role: AdminRole.TRUST_SAFETY, slug: "trust", name: "اعتماد و ایمنی آزمون (QA)" },
  { role: AdminRole.PARTNER_OPERATIONS, slug: "partner", name: "عملیات شرکا آزمون (QA)" },
  { role: AdminRole.CLINIC_OPERATIONS, slug: "clinic", name: "عملیات کلینیک آزمون (QA)" },
  { role: AdminRole.COMMERCE_OPERATIONS, slug: "commerce", name: "عملیات فروشگاه آزمون (QA)" },
  { role: AdminRole.ANALYTICS, slug: "analytics", name: "تحلیلگر آزمون (QA)" },
  { role: AdminRole.READ_ONLY, slug: "readonly", name: "فقط‌خواندنی آزمون (QA)" },
];

async function main() {
  const db = new PrismaClient();
  const database = new URL(process.env.DATABASE_URL ?? "").pathname;
  if (!database.endsWith("_test") && process.env.PETLIFE_QA_SEED_DATABASE !== database.slice(1)) throw new Error("Refusing: not a *_test database and PETLIFE_QA_SEED_DATABASE does not name it.");
  const stored = new Map<string, string>();
  if (existsSync(FILE)) for (const line of readFileSync(FILE, "utf8").split("\n")) {
    const m = line.match(/^(qa\.admin\.[a-z]+)\s+(\S+)\s+(\S+)$/);
    if (m) stored.set(m[1]!, m[3]!);
  }
  const lines: string[] = ["# PET LIFE QA admin personas (demo only). username  role  password"];
  let generated = 0;
  try {
    for (const p of PERSONAS) {
      const email = `qa-admin-${p.slug}@example.test`;
      const username = `qa.admin.${p.slug}`;
      const user = await db.user.upsert({ where: { email }, create: { email, displayName: p.name, username, normalizedUsername: username, locale: "fa" }, update: {} });
      let password = stored.get(username);
      if (!password || !user.passwordHash || !(await verifyPassword(user.passwordHash, password))) {
        password = randomBytes(18).toString("base64url");
        await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), username, normalizedUsername: username } });
        generated++;
      }
      await db.adminUser.upsert({ where: { userId: user.id }, create: { userId: user.id, role: p.role, status: AdminMembershipStatus.ACTIVE }, update: { role: p.role, status: AdminMembershipStatus.ACTIVE } });
      lines.push(`${username}  ${p.role}  ${password}`);
    }
    // Demo approval queue: one PENDING high-impact proposal from the QA ADMIN (never applied by the seed).
    const qaAdmin = await db.adminUser.findFirstOrThrow({ where: { user: { email: "qa-admin-admin@example.test" } } });
    const key = "commerce.refundApprovalThresholdIrr";
    if (!(await db.platformSettingChange.count({ where: { key, requestedByAdminId: qaAdmin.id } }))) {
      const current = await db.platformSetting.findUnique({ where: { key } });
      const previous = current ? current.value : Number(process.env.ADMIN_REFUND_APPROVAL_THRESHOLD_IRR ?? 5_000_000); // env default
      await db.platformSettingChange.create({ data: { key, previousValue: previous ?? undefined, proposedValue: 15_000_000, baseVersion: current?.version ?? 0, status: "PENDING", reason: "پیشنهاد نمایشی QA — بازبینی آستانه‌ی تأیید بازپرداخت", requestedByAdminId: qaAdmin.id } });
    }
    // ERP-B demo states (QA-only accounts): a suspended member, and a pet whose household lost a member who still
    // holds a HOUSEHOLD grant — so Customer 360 and Pet 360 diagnostics have something real to show.
    await db.user.upsert({ where: { email: "qa-suspended@example.test" }, create: { email: "qa-suspended@example.test", displayName: "عضو معلق نمایشی (QA)", locale: "fa", accountStatus: "SUSPENDED", suspendedAt: new Date(), suspendedReason: "QA demo — تعلیق نمایشی برای Customer 360", suspendedByAdminId: qaAdmin.id }, update: {} });
    const erpOwner = await db.user.upsert({ where: { email: "qa-erp-owner@example.test" }, create: { email: "qa-erp-owner@example.test", displayName: "مالک ERP (QA)", locale: "fa" }, update: {} });
    const leaver = await db.user.upsert({ where: { email: "qa-erp-leaver@example.test" }, create: { email: "qa-erp-leaver@example.test", displayName: "عضو سابق خانوار (QA)", locale: "fa" }, update: {} });
    let hh = await db.household.findFirst({ where: { members: { some: { userId: erpOwner.id, role: "OWNER" } } } });
    if (!hh) hh = await db.household.create({ data: { name: "خانوار ERP (QA)", city: "تهران", countryCode: "IR", members: { create: { userId: erpOwner.id, role: "OWNER" } } } });
    let pet = await db.pet.findFirst({ where: { householdId: hh.id } });
    if (!pet) pet = await db.pet.create({ data: { householdId: hh.id, name: "پت ERP (QA)", species: "DOG", approximateAgeMonths: 36 } });
    const full = { canViewIdentity: true, canEditIdentity: true, canViewHealth: true, canEditHealth: true, canBookCare: true, canViewCareProfile: true, canEditCareProfile: true, canManageAccess: true };
    if (!(await db.petAccessGrant.count({ where: { petId: pet.id, userId: erpOwner.id } }))) await db.petAccessGrant.create({ data: { petId: pet.id, userId: erpOwner.id, ...full } });
    if (!(await db.petAccessGrant.count({ where: { petId: pet.id, userId: leaver.id } }))) await db.petAccessGrant.create({ data: { petId: pet.id, userId: leaver.id, canViewIdentity: true, canViewHealth: true, source: "HOUSEHOLD", reason: "QA demo — عضو قبلی خانوار" } });

    // ERP-C demo partners (QA-only orgs, sample evidence only — never an external verification).
    const qaSuper = await db.adminUser.findFirstOrThrow({ where: { user: { email: "qa-admin-super@example.test" } } });
    const pdf = demoPdf("PetLife QA DEMO verification document - sample data only, not a real licence or registration.");
    const storeDoc = (key: string) => { const path = resolve(process.env.STORAGE_LOCAL_DIR ?? "./local-storage", key); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, pdf); };
    const partnerDoc = async (key: string, subjectType: "PROVIDER" | "SELLER", subjectId: string, kind: "LICENSE" | "BUSINESS_REGISTRATION" | "IDENTITY", status: "PENDING" | "ACCEPTED" | "REJECTED", extra: { expiresAt?: Date; reviewNote?: string } = {}) => {
      const objectKey = `partner-verification/${subjectType === "PROVIDER" ? "provider" : "seller"}/${subjectId}/qa-demo-${key}.pdf`;
      storeDoc(objectKey);
      return db.partnerVerificationDocument.upsert({ where: { id: sid(`doc:${key}`) }, create: { id: sid(`doc:${key}`), subjectType, subjectId, kind, objectKey, mimeType: "application/pdf", fileSizeBytes: pdf.length, status, uploadedByUserId: erpOwner.id, reviewedByAdminId: status === "PENDING" ? null : qaSuper.id, reviewedAt: status === "PENDING" ? null : new Date(), ...extra }, update: {} });
    };
    const providerOrg = async (key: string, name: string, type: "GROOMER" | "TRAINER", status: "VERIFIED" | "SUBMITTED") => {
      const org = await db.providerOrganization.upsert({ where: { id: sid(`provider:${key}`) }, create: { id: sid(`provider:${key}`), name, type, verificationStatus: status, verificationSubmittedAt: new Date(Date.now() - 26 * 3600e3) }, update: {} });
      if (!(await db.providerUser.count({ where: { providerOrganizationId: org.id, userId: erpOwner.id } }))) await db.providerUser.create({ data: { providerOrganizationId: org.id, userId: erpOwner.id, role: "OWNER" } });
      return org;
    };
    const provA = await providerOrg("a", "آرایشگاه نمایشی A (QA)", "GROOMER", "VERIFIED");
    await partnerDoc("provider-a-licence", "PROVIDER", provA.id, "LICENSE", "ACCEPTED");
    const expiring = await partnerDoc("provider-a-identity", "PROVIDER", provA.id, "IDENTITY", "ACCEPTED", { expiresAt: new Date(Date.now() + 20 * 86400e3) });
    const provB = await providerOrg("b", "مربی نمایشی B (QA)", "TRAINER", "SUBMITTED");
    await partnerDoc("provider-b-licence", "PROVIDER", provB.id, "LICENSE", "PENDING");
    const raise = (dedupeKey: string, data: { title: string; source: "PARTNER_VERIFICATION"; relatedEntityType: string; relatedEntityId: string; priority?: "NORMAL" | "HIGH"; dueAt?: Date }) =>
      db.adminTask.createMany({ data: [{ dedupeKey, team: "PARTNER_OPERATIONS", status: "OPEN", priority: data.priority ?? "NORMAL", ...data }], skipDuplicates: true });
    await raise(`verification-submitted:PROVIDER:${provB.id}:qa-demo`, { title: `Verification submitted: ${provB.name}`, source: "PARTNER_VERIFICATION", relatedEntityType: "PROVIDER_ORGANIZATION", relatedEntityId: provB.id, dueAt: new Date(Date.now() + 2 * 86400e3) });
    await raise(`verification-document-expiring:${expiring.id}`, { title: "Verification document expiring (IDENTITY)", source: "PARTNER_VERIFICATION", relatedEntityType: "PROVIDER_ORGANIZATION", relatedEntityId: provA.id, dueAt: expiring.expiresAt ?? undefined });
    await db.partnerVerificationDocument.updateMany({ where: { id: expiring.id, expiryAlertedAt: null }, data: { expiryAlertedAt: new Date() } });
    const sellerOrg = async (key: string, name: string, verificationStatus: "VERIFIED" | "REJECTED", note: string | null) => {
      const org = await db.sellerOrganization.upsert({ where: { id: sid(`seller:${key}`) }, create: { id: sid(`seller:${key}`), name, verificationStatus, verificationNote: note, status: verificationStatus === "VERIFIED" ? "ACTIVE" : "PENDING", countryCode: "IR" }, update: {} });
      if (!(await db.sellerMembership.count({ where: { sellerOrganizationId: org.id, userId: erpOwner.id } }))) await db.sellerMembership.create({ data: { sellerOrganizationId: org.id, userId: erpOwner.id, role: "OWNER" } });
      return org;
    };
    const sellA = await sellerOrg("a", "فروشنده نمایشی A (QA)", "VERIFIED", null);
    await partnerDoc("seller-a-registration", "SELLER", sellA.id, "BUSINESS_REGISTRATION", "ACCEPTED");
    const sellB = await sellerOrg("b", "فروشنده نمایشی B (QA)", "REJECTED", "مدرک ثبت کسب‌وکار خوانا نیست؛ لطفاً نسخه‌ی واضح بارگذاری کنید (QA demo).");
    await partnerDoc("seller-b-registration", "SELLER", sellB.id, "BUSINESS_REGISTRATION", "REJECTED", { reviewNote: "تصویر ناخوانا (QA demo)" });
    // Clinic: the batch-3 demo clinic gets one entitlement override (no payment, reasoned, by the QA super admin).
    const clinicOwner = await db.providerUser.findFirst({ where: { role: "OWNER", removedAt: null, user: { email: "batch3-clinic-owner@example.test" } } });
    if (clinicOwner && !(await db.clinicEntitlementOverride.count({ where: { providerOrganizationId: clinicOwner.providerOrganizationId, key: "clinic.staff.max" } }))) {
      await db.clinicEntitlementOverride.create({ data: { providerOrganizationId: clinicOwner.providerOrganizationId, key: "clinic.staff.max", limitValue: 15, reason: "QA demo — ظرفیت آزمایشی کارکنان برای پایلوت", createdByAdminId: qaSuper.id, expiresAt: new Date(Date.now() + 90 * 86400e3) } });
    }

    writeFileSync(FILE, `${lines.join("\n")}\n`, { mode: 0o600 });
    chmodSync(FILE, 0o600);
    console.log(`QA admin personas + ERP-B/C demo states: ${PERSONAS.length} ready (${generated} password(s) generated); credentials in ${FILE} (600).`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
