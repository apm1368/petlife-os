# H17 branch synchronization — 2026-09-04

UPDATE: The runtime blocker below is historical. Local infrastructure became reachable; pending migrations were applied and API restored. See shop-runtime-recovery.md for verified live Shop results. No Docker privilege workaround was used.

1. Branch: integration/local.
2. Claude commit 5e0a0c1 is confirmed present in HEAD ancestry (merge-base exit 0). Synced via regular merge 139bece. No conflicts, resets, overwritten work, rewritten commits or force push.
3. Actual route count: 111 (previously 94). docs/qa/routes.md regenerated from page.tsx files.
4. Confirmed H17: /[locale]/pets/[id]/health/advanced with documents, labs, imaging, referrals, dental, nutrition, rehab, observations and timeline; /[locale]/provider/patients/[petId]; /[locale]/provider/visits/[id]. H16 subscription and admin subscription routes are also present.
5. Previous G classifications withdrawn. No missing capability is certified from the stale snapshot. Remaining domain absence requires synchronized capability review; no fake shells created.
6. Shop LIVE acceptance BLOCKED: local data services cannot start under current Docker socket permissions. Product/offer/inventory rendering, detail navigation, anonymous browsing and all data states are not certified.
7. Header: prior desktop-centered header exists; responsive behavior/new icon control requirement is pending the data gate.
8. Landing: image-only Cookie, cats, building identities and prominent Memories remain pending. Visual edits paused.
9. Footer: requested minimal contact/FAQ/privacy/trust/social composition pending; destinations must be verified, not fabricated.
10. Public browsing: no new authentication behavior changed in this sync. H11 live regression recheck pending data availability; local preview is not proof of anonymous production access.
11. No new full visual acceptance claims.
12. Raw/mismatched triage retained in visual-inventory.md, newly added H17/H16 views unreviewed visually.
13. Runtime blocker: WSL user cannot access /var/run/docker.sock. Auto-review rejected sudo docker compose up -d as crossing that privilege boundary. No alternate root/socket workaround attempted. Ports 5432, 6379, 9000 and 4000 unavailable; web 3000 reachable.
14. Dependencies installed successfully including argon2; Prisma client generated; API build succeeds. Added missing API ESLint development dependency, fixing root lint command failure. No migrations, reset or seed applied.
15. No new RTL/LTR acceptance after sync; earlier landing checks remain historical only.
16. No new mobile acceptance after sync.
17. All frontend tests: 288 passed, 90 files (h17-web-tests.log).
18. Root typecheck passed (9 tasks); root build passed (4 tasks). Root lint passed after API ESLint dependency correction, four existing frontend content image warnings remain. Existing Next 14/ESLint 9 peer warning remains; no lint errors.
19. Preservation commit 6de61b6; integration merge 139bece. Follow-up inventory/dependency correction committed separately.

Next required action: user approval for privileged Docker Compose startup through normal sudo authentication, or user starts the existing Compose services locally. Then inspect DB state before migrations/seed, start API, and execute live Shop/public access checks. Do not resume visual certification before this gate.
