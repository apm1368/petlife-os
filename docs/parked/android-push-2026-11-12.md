# Parked: Android app + web/mobile push (2026-11-12)

> **وضعیت:** به درخواست مالک سایت متوقف شد (۲۰۲۶-۱۱-۱۲). نسخه اندروید ساخته نشده و چیزی منتشر یا دیپلوی نشده است.
> کار تا اینجا روی شاخه `claude/parked-android-push-2026-11-12` نگه داشته شده تا بعداً ادامه پیدا کند.

**Status:** paused by the owner on 2026-11-12, mid-way through step 1 (web push, API side). Nothing was merged,
deployed or built for Android. No PR was opened. This branch is a work-in-progress snapshot: it has **not** been
type-checked, linted or tested yet (the first `tsc` run was stopped when the pause arrived).

- Branch: `claude/parked-android-push-2026-11-12` (based on `main` at `a29dfd96`, PR #278)
- Worktree on the server: `/var/www/petlife-os-worktrees/parked-android-push-2026-11-12`
- Owner of the work: session X4

## Scope that was asked for

1. Web push first: service worker + PWA manifest (installable, offline shell), VAPID keys server-side, subscription
   endpoints in the API, per-user opt-in in member notification settings in every locale, and delivery of every
   existing notification event as a new channel that honours preferences.
2. Android app: chosen approach, signed AAB/APK built in GitHub Actions (never on the 3.9 GB server), Digital Asset
   Links, store-publishing docs (Google Play / Cafe Bazaar / Myket). Packaging was to happen last, after the other
   sessions' feature work lands.
3. Push for every place a reminder is sent today, including the vet panel's client reminders (X3).

## What is done on this branch (API only, untested)

| Area | Files |
| --- | --- |
| Dependency `web-push@3.6.7` (stable; 4.0.0 was 6 days old) + `@types/web-push@3.6.4` | `apps/api/package.json`, `pnpm-lock.yaml` (server mirror's `tarball:` fields stripped; `--frozen-lockfile --offline` install passes) |
| `PushSubscription` model (one row per endpoint, cascade on user delete) and `MessagingProvider.WEB_PUSH` | `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261112210000_web_push_subscriptions/` (additive only) |
| Env: `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` (default `https://opetlife.ir`), `WEB_PUSH_TTL_SECONDS`, `WEB_PUSH_TIMEOUT_MS`; startup fails if only one key is set | `apps/api/src/config/env.ts`, `apps/api/.env.example` |
| Endpoint allowlist (SSRF guard: only FCM, Mozilla, WNS, Apple push hosts over https), masking, device label from UA (raw UA never stored) | `notifications/push/push-endpoint.util.ts` |
| VAPID sender with per-call keys, payload size cap, outcome classes (SENT / GONE 404·410·403 / TRANSIENT 429·5xx·network / PERMANENT) | `notifications/push/web-push.service.ts` |
| Subscribe (upsert by endpoint; max 10 devices per user), unsubscribe, remove device, list, test send (localized fa/en/de/es) | `notifications/push/push-subscription.service.ts`, `push-payload.util.ts` |
| Routes: `GET /push/config` (public key, public), `GET/POST /push/subscriptions`, `POST /push/subscriptions/remove`, `DELETE /push/subscriptions/:id`, `POST /push/subscriptions/test` (throttled) | `notifications/push/push.controller.ts`, `notifications.module.ts` |
| PUSH fan-out in `NotificationOrchestratorService.notify()`: every event that already notifies (care reminders, bookings, orders, lost-pet, clinic and vet-panel reminders) reaches subscribed devices; follows the in-app preference and the category×PUSH preference; quiet hours deliver **silently** (URGENT keeps sound); no row when the user has no device | `notification-orchestrator.service.ts` |
| PUSH branch in `NotificationDeliveryService.attempt()`: one delivery row covers all devices, per-device bookkeeping, retries reuse the existing backoff/attempt budget and never resend to a device already reached; worker picks up PUSH retries automatically | `notification-delivery.service.ts` |
| Preferences grid includes PUSH; channel state `LIVE` when the VAPID pair is configured, else `NOT_CONFIGURED` | `notification-preference.service.ts` |

## What is left

### Web push (step 1)
- [ ] Run `tsc`, lint and the API unit/e2e suites; fix whatever they find. Add unit specs for
      `push-endpoint.util`, `encodePushPayload`, the outcome classification and the PUSH delivery branch.
- [ ] `apps/web/public/sw.js`: `push` → `showNotification` (title, body, icon `/brand/opl/app-icon-192.png`,
      monochrome badge, `tag` = notification id, `lang`/`dir`, `silent`), `notificationclick` (same-origin URL check,
      focus an open tab or open a new one), `pushsubscriptionchange` (re-subscribe; the page syncs it on the next visit),
      and an offline fallback for navigations only (no page or API caching).
- [ ] Per-locale manifest at `/{locale}/manifest.webmanifest` (route handler iterating `locales` from
      `apps/web/lib/i18n/config.ts`), linked from `app/[locale]/layout.tsx` metadata; `start_url` `/` for fa and
      `/{locale}` otherwise, `scope` `/`, icons incl. `maskable-512.png`.
- [ ] Opt-in card at the top of `features/notifications/NotificationPreferencesView.tsx`: state (unsupported /
      blocked / off / on), enable, disable, "send a test", list of other devices; a PUSH column in the grid when the
      channel is not `NOT_CONFIGURED`; iOS hint (needs "Add to Home Screen", iOS 16.4+).
- [ ] Client sync: on app load, re-POST the browser's current subscription if it changed; only for the member who
      opted in on that browser (owner id kept locally).
- [ ] Sign-out (`features/account/use-sign-out.ts`): remove this browser's subscription server-side and unsubscribe
      it before ending the session, so the next person on the device never gets the previous member's notifications.
- [ ] Copy in `apps/web/messages/{fa,en,de,es}.json` under `notifications.preferencesPage.push.*` and
      `channels.PUSH`; X1 has agreed to add ar/nl for these keys when their locales land.
- [ ] Optional: a PUSH line in admin system health (`admin-system.service.ts`) next to SMS/EMAIL.
- [ ] Generate the VAPID pair **on the server** (see owner actions) and verify live in fa/en/de/es:
      subscribe → real reminder arrives → unsubscribe.

### Android app (step 2): not started
- [ ] Bubblewrap TWA project (`apps/android/` or similar) with `enableNotifications: true` (notification delegation:
      web push shows under the app's own name/icon, Android 13+ permission prompt handled by the template).
- [ ] `/.well-known/assetlinks.json` served by the web app with the release key's SHA-256 fingerprint
      (and Play App Signing's fingerprint if Google Play signs).
- [ ] GitHub Actions workflow that builds the signed AAB (Play) and APK (Cafe Bazaar / Myket) from repository
      secrets; nothing Gradle-related runs on the server.
- [ ] Store listing guide for Google Play, Cafe Bazaar and Myket (screenshots, privacy policy URL, content rating,
      Bazaar/Myket review rules for web-based apps — check these before submitting).

### Related follow-up found on the way
- Notification templates (`apps/api/src/modules/notifications/notification-templates.ts`) exist only in fa and en;
  de/es members get English text in the inbox, email and (later) push. Worth translating before push goes live.

## Decisions made (and why)

- **Web push via VAPID, no Firebase project.** Browsers (and Chrome inside the Android app) use their own push
  service; the server only needs a VAPID key pair. Chrome's push service is FCM, so Android delivery is FCM without
  us holding a Firebase account (Firebase console access from Iran is unreliable). The server reached all four push
  services (FCM, Mozilla, Apple, WNS) in a test on 2026-11-12.
- **Android: Trusted Web Activity (Bubblewrap), not Capacitor, as the default.** The app is the live site, so every
  deploy updates it with no store re-release; push is the same web push (notification delegation); the APK is tiny;
  Digital Asset Links remove the URL bar. Capacitor stays the fallback only if a native device API or native FCM
  becomes necessary (it would need a Firebase project and `google-services.json`).
  Known limits: TWA needs a TWA-capable browser (Chrome) on the device; devices without Google Play services get no
  web push in any browser. Iranian push services (e.g. Pushe, Najva) would be a separate, later decision.
- **Endpoint allowlist** (only known push-service hosts over https), because the API POSTs to the endpoint URL.
- **Push follows the inbox:** a category off in-app is never pushed; quiet hours mean silent push, not deferred push.
- **One device belongs to whoever subscribed on it last** (upsert by endpoint), plus unsubscribe on sign-out.

## What the owner must provide or decide

1. **Go-ahead to resume** (web push can ship without the Android app).
2. **VAPID keys:** none were generated. When resuming, generate them on the server
   (`npx web-push generate-vapid-keys`) and put them only in `/var/www/petlife-os/apps/api/.env`
   (`WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`). Never commit them; never rotate them unless they leak
   (rotation silently drops every existing subscription).
3. **Android signing keystore:** none was created. The owner must choose where the upload key lives (recommended:
   GitHub Actions encrypted secrets for CI, plus an offline backup the owner controls; Google Play App Signing keeps
   the app signing key). Losing the key means Cafe Bazaar/Myket updates can no longer be published under the same app.
4. **Store accounts:** Google Play developer account, Cafe Bazaar and Myket developer accounts, the Android package
   name (e.g. `ir.opetlife.app`) and the store listing texts/screenshots per language.
5. **Contact for push services:** `WEB_PUSH_SUBJECT` defaults to `https://opetlife.ir`; a `mailto:` address can be
   used instead if the owner prefers.

## Secrets and keys

- No VAPID key, keystore or other secret was generated or stored anywhere for this work. `apps/api/.env.example`
  contains only commented, empty placeholders.
