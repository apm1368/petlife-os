# ایمیل سازمانی opetlife.ir (سرور ایمیل + وب‌میل)

راه‌اندازی: ۲۰۲۶-۱۱-۱۲. همه‌چیز روی همان VPS سایت (185.231.112.154، پارس‌پک) اجرا می‌شود.
این سند هیچ رمز، کلید خصوصی یا توکنی ندارد. رمزها فقط در فایل‌های فقط-root روی سرور هستند.

## ۱. وضعیت فعلی

| بخش | وضعیت |
|---|---|
| وب‌میل `https://webmail.opetlife.ir` (Roundcube) | ✅ فعال، TLS معتبر |
| صندوق‌ها `info@` `support@` `noreply@` `admin@` | ✅ فعال (هرکدام ۲ گیگ) |
| IMAP / SMTP برای گوشی و برنامه‌های ایمیل | ✅ IMAPS 993، SMTPS 465، Submission 587 (STARTTLS) |
| ایمیل تراکنشی سایت (بازیابی رمز و اعلان‌ها) از `noreply@opetlife.ir` | ✅ روی سایت زنده آزمایش شد |
| SPF، DKIM (۲۰۴۸ بیتی)، DMARC، MTA-STS، TLS-RPT، SRV | ✅ در DNS پارس‌پک ثبت و با `dig` بررسی شد |
| PTR آی‌پی 185.231.112.154 → `mail.opetlife.ir` | ✅ از ۲۰۲۶-۱۱-۱۲ ساعت ۱۹:۳۱ UTC تنظیم شد (FCrDNS درست است) |
| تحویل به Outlook/Hotmail/Microsoft 365 | ❌ مایکروسافت رنج آی‌پی پارس‌پک را بلاک کرده (S3140) |

## ۲. اجزا و پورت‌ها

| جزء | نسخه / منبع | نقش |
|---|---|---|
| Postfix | 3.8 (Ubuntu main، آپدیت امنیتی خودکار) | SMTP ورودی (25)، ارسال کاربران (465/587) |
| Dovecot | 2.3 (Ubuntu main) | IMAP، LMTP، Sieve، احراز هویت (SASL برای Postfix) |
| OpenDKIM | 2.11 (Ubuntu) | امضای DKIM خروجی و بررسی DKIM ورودی |
| postfix-policyd-spf-python | Ubuntu | بررسی SPF ایمیل‌های ورودی |
| Roundcube | **1.6.21 نسخهٔ رسمی** (امضای GPG بررسی شد) | وب‌میل. نسخهٔ Ubuntu (1.6.6) قدیمی و بدون وصله‌های امنیتی جدید بود. |
| PHP-FPM | 8.3 (Ubuntu main) | فقط یک pool به نام `roundcube`، حالت ondemand |
| fail2ban | 1.0 (Ubuntu) | مسدودسازی brute-force برای SMTP/IMAP/وب‌میل |

ClamAV و rspamd عمداً نصب نشدند، چون رم سرور (۳.۹ گیگ، مشترک با سایت و جلسه‌های دیگر) کم است.

| پورت | سرویس | دسترسی |
|---|---|---|
| 25 | Postfix (postscreen) | عمومی؛ فقط دریافت، بدون AUTH |
| 465 | Postfix smtps (TLS مستقیم) | عمومی؛ فقط با AUTH |
| 587 | Postfix submission | عمومی؛ AUTH فقط بعد از STARTTLS |
| 993 | Dovecot IMAPS | عمومی؛ TLS ≥ 1.2 |
| 143 | Dovecot IMAP | فقط 127.0.0.1 |
| 4190 | ManageSieve (پاسخ خودکار در وب‌میل) | فقط 127.0.0.1 |
| 8891 | OpenDKIM milter | فقط 127.0.0.1 |
| 80/443 | nginx (وب‌میل، mta-sts، autoconfig) | عمومی |

POP3 خاموش است. ufw فقط 25/465/587/993 را به 22/80/443 قبلی اضافه کرد.

## ۳. امکان‌سنجی (اندازه‌گیری ۲۰۲۶-۱۱-۱۲)

- **پورت 25 خروجی باز است.** جیمیل، iCloud و Yandex اتصال و `MAIL FROM` را پذیرفتند.
- **مایکروسافت** (outlook.com و EOP): `550 5.7.1 ... part of their network is on our block list (S3140)`، یعنی کل رنج پارس‌پک بلاک است، نه فقط این آی‌پی.
- **یاهو:** `550 5.7.25 Forward-confirmed reverse DNS failed`، یعنی PTR لازم بود. پس از تنظیم PTR پذیرفت.
- **mail.com/GMX:** `554 ... Service not available` (اعتبار آی‌پی).
- **DNSBL:** آی‌پی در Spamcop، SORBS، UCEPROTECT، Barracuda، PSBL و Mailspike لیست نشده است.
- **ورودی از اینترنت:** check-host.net پورت 25 را از ۵ نقطه از ۸ نقطه باز دید و 465/587/993 را تقریباً از همه‌جا. بعضی مسیرهای بین‌المللی ایران گاهی timeout می‌شوند؛ فرستنده‌ها دوباره تلاش می‌کنند.
- **سرویس‌های واسط (smarthost) در دسترس از سرور:** Brevo `:2525`، SMTP2GO `:587/:2525`، SendGrid `:2525`، Amazon SES `:587`، Postmark `:587`.
  - Mailgun، Mailjet، Resend، Zoho، Elastic و MailerSend در دسترس نبودند.
  - ثبت‌نام در این سرویس‌ها از ایران به‌خاطر تحریم دشوار است.
  - سرویس‌های ایمیل میزبانی‌شده (Google Workspace، Microsoft 365، Zoho) از ایران قابل استفاده نیستند یا از سرور در دسترس نبودند. به همین دلیل گزینهٔ «میزبانی روی همین سرور» انتخاب شد.

## ۴. صندوق‌ها و نام‌های مستعار

| آدرس | نوع |
|---|---|
| `info@` `support@` `noreply@` `admin@` | صندوق (Maildir در `/var/vmail/opetlife.ir/<name>/`) |
| `postmaster@` `abuse@` `hostmaster@` `webmaster@` `dmarc@` `tlsrpt@` `root@` | مستعار → `admin@` |

- **رمزها:** هر صندوق یک رمز تصادفی ۲۴ نویسه‌ای دارد که با SHA512-CRYPT هش می‌شود. رمز خام فقط در یک فایل فقط-root روی سرور ذخیره شده و مسیرش در راهنمای روی سرور آمده است. هیچ رمزی در چت، git یا لاگ نیامده است.
- **مدیریت** (روی سرور، با root):

```bash
opetlife-mail add sales        # ساخت sales@ با رمز تصادفی (رمز چاپ نمی‌شود)
opetlife-mail add hr 5G        # با سهمیهٔ ۵ گیگ
opetlife-mail passwd info      # رمز تازه
opetlife-mail alias hello info # مستعار
opetlife-mail del sales        # غیرفعال‌سازی (نامه‌ها می‌مانند)
opetlife-mail list
```

- **محدودیت ارسال:** هر کاربر فقط با آدرس خودش (و مستعارهای خودش) می‌تواند ایمیل بفرستد (`reject_sender_login_mismatch`). در وب‌میل هم `identities_level = 3` است.

## ۵. DNS (پارس‌پک)

همهٔ رکوردها در ۲۰۲۶-۱۱-۱۲ با API پارس‌پک ثبت شدند. توکن از پنل ساخته شد (CDN ← «مدیریت توکن ها»)، به آی‌پی سرور محدود بود و بعد از کار حذف شد.

| نوع | نام | مقدار |
|---|---|---|
| MX | @ | `10 mail.opetlife.ir` (از قبل بود) |
| A | mail, webmail, mta-sts, autoconfig, autodiscover | `185.231.112.154` (رکورد `*` هم از قبل بود) |
| TXT | @ | `v=spf1 ip4:185.231.112.154 -all` |
| TXT | mail | `v=spf1 a -all` (SPF برای HELO) |
| TXT | mail2026._domainkey | `v=DKIM1; h=sha256; k=rsa; p=…` (کلید عمومی ۲۰۴۸ بیتی) |
| TXT | _dmarc | `v=DMARC1; p=none; rua=mailto:dmarc@opetlife.ir; fo=1; adkim=r; aspf=r` |
| TXT | _mta-sts | `v=STSv1; id=20261112` |
| TXT | _smtp._tls | `v=TLSRPTv1; rua=mailto:tlsrpt@opetlife.ir` |
| SRV | _submissions._tcp / _submission._tcp / _imaps._tcp | `0 1 465/587/993 mail.opetlife.ir` |

نکته‌های API پارس‌پک:
- آدرس پایه `https://my.parspack.com/cdnapi/external/api/v2/zones/<uuid>/dns-records` است و توکن به‌صورت `Authorization: Bearer` فرستاده می‌شود.
- میزبان‌ها نسبی‌اند (`@`، `_dmarc`) و `proxy: direct` است.
- **TXT بلندتر از ۲۵۵ نویسه خطای HTTP 500 می‌دهد.** کلید DKIM را باید به چند رشتهٔ quote‌شده تقسیم کرد: `"…250 نویسه…" "…بقیه…"`.

## ۶. TLS

- گواهی Let's Encrypt با نام `mail.opetlife.ir` (کلید RSA ۲۰۴۸) شامل `mail`، `webmail`، `mta-sts`، `autoconfig` و `autodiscover` است.
- روش صدور webroot روی `/var/www/letsencrypt` است، همان مسیری که گواهی سایت استفاده می‌کند و از default server پورت 80 سرو می‌شود.
- تمدید با `certbot.timer` خودکار است. هوک `renewal-hooks/deploy/reload-mail` بعد از تمدید این گواهی Postfix و Dovecot را reload می‌کند؛ هوک قبلی `reload-nginx` هم nginx را reload می‌کند.

## ۷. nginx و وب‌میل

- فایل جدا: `/etc/nginx/sites-available/opetlife-mail` (نمونه: [mail/nginx-opetlife-mail.conf](mail/nginx-opetlife-mail.conf)). فایل `petlife-os` سایت دست نخورد. `configure-opetlife-domain.sh` در دیپلوی هم فقط فایل خودش را عوض می‌کند.
- `mail.opetlife.ir` با کد 301 به `webmail.opetlife.ir` می‌رود.
- `mta-sts.opetlife.ir/.well-known/mta-sts.txt` با حالت `testing` و `max_age` یک روز سرو می‌شود.
- `autoconfig` (Thunderbird و اندروید) و `autodiscover` (Outlook، هر متد HTTP) تنظیمات IMAP/SMTP را برمی‌گردانند.
- **Roundcube:**
  - مسیر نصب `/var/www/roundcube-1.6.21` با symlink از `/var/www/roundcube` است. فقط `public_html` سرو می‌شود و پوشهٔ `installer` حذف شده است.
  - پیکربندی 640 با مالکیت `root:roundcube` است (نمونه: [mail/roundcube-config.inc.php.example](mail/roundcube-config.inc.php.example)). `des_key` فقط روی سرور است.
  - دیتابیس SQLite در `/var/lib/roundcube/db` و لاگ‌ها در `/var/log/roundcube/` هستند.
  - افزونه‌های فعال: archive، zipdownload، managesieve (پاسخ خودکار و فیلتر)، markasjunk و newmail_notifier.
  - امنیت: `ip_check`، `login_rate_limit`، کوکی Secure/HttpOnly/SameSite=Lax، HSTS، nosniff، X-Frame sameorigin و noindex.
- **PHP-FPM:** pool `roundcube` با کاربر سیستمی جدای `roundcube`، `pm=ondemand` و حداکثر ۴ پروسه. محدودیت‌ها: `open_basedir`، غیرفعال بودن exec/system/proc_open/popen، و `memory_limit` 128M. pool پیش‌فرض `www` غیرفعال است.

## ۸. Postfix

همهٔ تنظیمات با [mail/configure-postfix.sh](mail/configure-postfix.sh) اعمال شده‌اند (اسکریپت idempotent است). نکته‌های اصلی:

- **میزبان‌ها:** `myhostname = mail.opetlife.ir`. دامنهٔ مجازی `opetlife.ir` از طریق LMTP به Dovecot تحویل داده می‌شود. ایمیل سیستمی (`root@mail.opetlife.ir`) محلی می‌ماند.
- **پورت 25:**
  - postscreen با تست pregreet و DNSBL وزنی (Spamhaus با فیلتر کد، Spamcop، PSBL، Mailspike) و آستانهٔ 3.
  - HELO باید معتبر و FQDN باشد.
  - دامنهٔ فرستنده باید وجود داشته باشد.
  - SPF ورودی با policyd-spf بررسی می‌شود.
  - ایمیل بدون احراز هویت با فرستندهٔ `@opetlife.ir` رد می‌شود (`own_domain_senders`).
  - گیرندهٔ ناشناس رد می‌شود.
- **۴۶۵/۵۸۷:**
  - `permit_sasl_authenticated, reject`.
  - TLS اجباری (`encrypt`).
  - `reject_sender_login_mismatch` با نقشهٔ `sender_login`.
  - `cleanup` جدا با [header_checks](mail/postfix-submission_header_checks) که هدر Received حاوی آی‌پی خانه یا گوشی فرستنده (`with ESMTPSA`) را حذف می‌کند.
- **رله باز نیست:** `smtpd_relay_restrictions = permit_mynetworks, permit_sasl_authenticated, reject_unauth_destination` و `mynetworks` فقط loopback است.
- **محدودیت نرخ:** ۳۰ اتصال در دقیقه برای هر کلاینت، ۱۲ AUTH در دقیقه، ۶۰ پیام در دقیقه. حداکثر اندازهٔ پیام ۲۵ مگابایت است.
- **TLS خروجی:** `smtp_tls_security_level = may`. `inet_protocols = ipv4` است، چون سرور IPv6 عمومی ندارد.

## ۹. Dovecot

پیکربندی: [mail/dovecot-local.conf](mail/dovecot-local.conf) در `/etc/dovecot/local.conf`. در `10-auth.conf`، خط `auth-system` غیرفعال شده تا کاربران سیستمی نتوانند وارد شوند.

- passdb و userdb از نوع `passwd-file` (`/etc/dovecot/users` با مجوز 640 و مالکیت `root:dovecot`) هستند. همهٔ صندوق‌ها با uid/gid ۵۰۰۰ (`vmail`) ذخیره می‌شوند.
- `ssl = required` با TLS ≥ 1.2، و `auth_failure_delay` ۳ ثانیه است.
- سهمیهٔ پیش‌فرض ۲ گیگ است و برای هر کاربر از فیلد `userdb_quota_rule` قابل تغییر است. `lmtp_rcpt_check_quota` روشن است.
- پوشه‌های Drafts، Sent، Trash، Junk و Archive به‌صورت خودکار ساخته و subscribe می‌شوند.

## ۱۰. DKIM

- selector `mail2026` با کلید RSA ۲۰۴۸ بیتی است. کلید خصوصی فقط روی سرور است (مالک `opendkim`، مجوز 600).
- `SigningTable` همهٔ آدرس‌های `*@opetlife.ir` را امضا می‌کند. هدرهای امضاشده: From، To، Subject، Date، Message-ID، MIME، Reply-To، List-Unsubscribe و چند هدر دیگر. From، Subject، Date، To و Message-ID oversign می‌شوند.
- پیکربندی: [mail/opendkim.conf](mail/opendkim.conf).
- **چرخش کلید:**
  1. یک selector تازه بسازید (مثلاً `mail2027`) و رکورد TXT آن را منتشر کنید.
  2. `key.table` و `signing.table` را عوض کنید.
  3. بعد از یک هفته رکورد قدیمی را بردارید.

## ۱۱. امنیت

- **fail2ban:** jailهای `postfix-sasl`، `dovecot` و `roundcube-auth` فعال‌اند (پیکربندی: [mail/fail2ban-opetlife-mail.local](mail/fail2ban-opetlife-mail.local)).
  - ۶ تلاش ناموفق در ۱۰ دقیقه باعث ۱ ساعت مسدودیت می‌شود و برای تکرارکننده‌ها تا ۱ هفته بیشتر می‌شود.
  - آی‌پی خود سرور (که وب‌میل و API از آن وصل می‌شوند) نادیده گرفته می‌شود.
  - این فایل فقط jailهای ایمیل را تعریف می‌کند.
- **سقف رم:** drop-in به نام `opetlife-memory.conf` در systemd تعریف شده است ([mail/systemd-memory-dropin.conf](mail/systemd-memory-dropin.conf)):

  | سرویس | MemoryMax |
  |---|---|
  | postfix@ | 200M |
  | dovecot | 256M |
  | opendkim | 64M |
  | php8.3-fpm | 320M |
  | fail2ban | 128M |

  مصرف واقعی کل سیستم ایمیل حدود ۷۵ مگابایت RSS است.
- **کلیدهای env در API:** فقط نام کلیدها اینجا آمده است: `EMAIL_PROVIDER=smtp`، `EMAIL_FROM_ADDRESS`، `EMAIL_FROM_NAME`، `EMAIL_REPLY_TO`، `SMTP_HOST=mail.opetlife.ir`، `SMTP_PORT=465`، `SMTP_SECURE=true`، `SMTP_USER`، `SMTP_PASSWORD`. مقدارها در `apps/api/.env` سرور هستند، که در git نیست.

## ۱۲. پشتیبان

- `opetlife-mail-backup.timer` هر روز ساعت ۰۳:۴۰ UTC یک آرشیو tar.gz با مجوز 600 در `/root/backups/mail/` می‌سازد و ۷ نسخهٔ آخر را نگه می‌دارد (واحدها: [service](mail/opetlife-mail-backup.service)، [timer](mail/opetlife-mail-backup.timer)).
- آرشیو شامل این‌هاست: `/var/vmail`، `/etc/postfix`، `/etc/dovecot`، `/etc/opendkim*`، پیکربندی و دیتابیس Roundcube، فایل‌های meta، nginx، fail2ban، اسکریپت مدیریت و فایل رمزها.
- **این پشتیبان روی همان دیسک است.** نسخهٔ بیرون از سرور باید جدا نگه داشته شود.

## ۱۳. آزمون‌ها و نتیجه‌ها (۲۰۲۶-۱۱-۱۲)

| آزمون | نتیجه |
|---|---|
| ورود IMAPS، رمز اشتباه، دسترس نبودن 143 از بیرون | ✅ |
| AUTH روی 587 قبل از STARTTLS پیشنهاد نمی‌شود | ✅ |
| رله بدون احراز هویت از آی‌پی عمومی به یک دامنهٔ بیرونی | ✅ `554 5.7.1 Relay access denied` |
| جعل `@opetlife.ir` روی پورت 25 | ✅ رد شد |
| کاربر info@ که بخواهد به نام admin@ بفرستد | ✅ `553 ... not owned by user` |
| ورود به وب‌میل از طریق HTTPS (درست و غلط) | ✅ ورود موفق / 401 |
| ایمیل بازیابی رمز سایت (`POST /api/auth/password/forgot`) | ✅ از `noreply@` با DKIM معتبر و لینک `/fa/account/reset` رسید. حساب آزمایشی موقت پاک شد. |
| `check-auth@verifier.port25.com` (رفت‌وبرگشت) | ✅ پس از PTR: SPF pass، iprev pass و DKIM pass (هم‌خوان با From) |
| پذیرش در MAIL FROM پس از PTR | ✅ جیمیل، یاهو (قبل از PTR رد می‌کرد)، iCloud و Yandex. ❌ Outlook: هنوز S3140. |
| رکوردهای DNS روی 8.8.8.8، 1.1.1.1 و 9.9.9.9 | ✅ همه دیده می‌شوند و DKIM دقیقاً با کلید یکی است |

## ۱۴. کارهای باقی‌مانده و ریسک‌ها

1. **PTR:** ✅ انجام شد (منطقهٔ reverse روی `ns1/ns2.bitcommand.com` است). آزمون port25 هر سه بررسی را pass کرد. یک ارسال واقعی به جیمیل و نگاه به «Show original» برای دیدن inbox یا اسپم هنوز مفید است.
2. **مایکروسافت (S3140):** راه‌ها یکی از این دو است:
   - پارس‌پک از مایکروسافت بخواهد رنج را از بلاک خارج کند؛
   - یا یک smarthost (Brevo یا SMTP2GO، پلن رایگان) وصل شود. برای این کار `relayhost` و `smtp_sasl_password_maps` تنظیم می‌شود و `include:` آن سرویس به SPF اضافه می‌شود.
3. **DMARC:** پس از ۲ تا ۴ هفته گزارش تمیز در `dmarc@`، مقدار به `p=quarantine` و بعد `p=reject` تغییر کند. MTA-STS هم از `testing` به `enforce` برود.
4. **اعتبار آی‌پی ایران:** در هفته‌های اول احتمال رفتن به اسپم بالاست. حجم ارسال را کم نگه دارید.
5. **به‌روزرسانی Roundcube** دستی است: ماهانه releaseهای `roundcube/roundcubemail` بررسی شود. روش: tarball جدید `-complete` را با امضای GPG بررسی و در `/var/www/roundcube-<ver>` باز کنید، `config/config.inc.php` را کپی کنید، `bin/update.sh` را اجرا کنید و symlink را عوض کنید. Postfix، Dovecot و PHP با unattended-upgrades به‌روز می‌شوند.

## ۱۵. عیب‌یابی

```bash
tail -f /var/log/mail.log                        # Postfix, Dovecot, OpenDKIM, SPF
postqueue -p                                     # صف ارسال
postqueue -f                                     # تلاش دوباره برای صف
fail2ban-client status dovecot                   # و postfix-sasl، roundcube-auth
fail2ban-client set dovecot unbanip <IP>         # آزاد کردن یک آی‌پی
tail -f /var/log/roundcube/errors.log            # ورودهای ناموفق وب‌میل
opetlife-mail-dnscheck                           # بررسی رکوردهای DNS و کلید DKIM
systemctl status postfix@- dovecot opendkim php8.3-fpm fail2ban
```
