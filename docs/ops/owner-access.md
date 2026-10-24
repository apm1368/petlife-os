# دسترسی مالک (بدون رمز در git)

| حساب | شناسه | نقش / دسترسی | فایل اطلاعات ورود (فقط روی سرور، 600) |
|---|---|---|---|
| ادمین مالک | `pedram` | `SUPER_ADMIN` از طریق RBAC عادی (`admin_users`) | `/root/petlife-owner-admin-credential.txt` |
| حساب بازبینی مالک | `owner.review` (`owner-review@example.test`) | پلن رایگان + override‌های ادمین هم‌سطح premium (رایگان، بدون پرداخت) | `/root/petlife-owner-review-credential.txt` |

فهرست: `/root/petlife-owner-access.txt`. ورود: `http://185.231.112.154/fa/account` (نام کاربری + رمز)؛ ادمین: `/fa/admin` و `/en/admin`.

- ساخت/به‌روزرسانی (idempotent؛ هیچ رمزی چاپ نمی‌شود):
  ```bash
  cd /var/www/petlife-os/apps/api && set -a && . ./.env && set +a
  PETLIFE_QA_SEED_DATABASE=petlife_os OWNER_REVIEW_CREDENTIAL_FILE=/root/petlife-owner-review-credential.txt npx ts-node --transpile-only prisma/seed-owner-review.ts
  PRISMA_CLIENT=/var/www/petlife-os/node_modules/.pnpm/node_modules/@prisma/client node ../../scripts/ops/provision-owner-access.js
  ```
- رمز ادمین هرگز خودکار عوض نمی‌شود؛ اگر اطلاعات ذخیره‌شده کار نکند، اسکریپت متوقف می‌شود و گزارش می‌دهد.
- هیچ مسیر یا شرط خاصی برای این حساب‌ها در کد نیست؛ ورود، RBAC و entitlement همان مسیرهای عادی محصول‌اند و اعطای override در audit ادمین ثبت می‌شود.
- **هیچ اسکریپت خودکاری (smoke/seed دیگر) نباید روی `owner.review` بنویسد.** smokeها فقط با `qa-smoke-free/paid` کار می‌کنند.
- تغییر رمز پس از ورود: «حساب → امنیت» (`PUT /auth/password`).
