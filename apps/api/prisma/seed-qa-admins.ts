/**
 * ERP QA admin personas — one per internal role, so Codex and QA can see every admin surface as that role would.
 *
 *   cd apps/api && (set -a; . ./.env; set +a; PETLIFE_QA_SEED_DATABASE=petlife_os npx ts-node --transpile-only prisma/seed-qa-admins.ts)
 *
 * Accounts are `qa-admin-<role>@example.test` / username `qa.admin.<role>`. Passwords are random, stored ONLY in
 * /root/petlife-qa-admin-credentials.txt (mode 600) — never printed, never committed. Re-running keeps a stored
 * password that still verifies and only (re)generates missing ones. Never touches pedram / owner.review.
 */
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { AdminMembershipStatus, AdminRole, PrismaClient } from "@prisma/client";
import { hashPassword, verifyPassword } from "../src/common/password/password-hash.util";

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

    writeFileSync(FILE, `${lines.join("\n")}\n`, { mode: 0o600 });
    chmodSync(FILE, 0o600);
    console.log(`QA admin personas + ERP-B demo states: ${PERSONAS.length} ready (${generated} password(s) generated); credentials in ${FILE} (600).`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
