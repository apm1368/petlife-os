# Bounded secrets scanning — 2026-11-10 UTC

[Sanitized machine report](security-scan-2026-11-10.json). No `Secret`, `Match`, author/email or credential value is committed. No candidate was sent to or validated against any provider. No allowlist/baseline was added to turn the scanner green, and no Git history was rewritten.

## Tool provenance and scope

Gitleaks **8.30.1**, official `gitleaks/gitleaks` release, Linux x64 archive SHA-256 `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb` verified before execution. Installed in a task-specific temporary directory, not the shared dependency tree. Runtime/proxy/TLS settings preserved. No repository/inline custom configuration was present.

The Git scan ran at checkout head `46cbb16f660ba93c3b9f3e6081218d4bb878cc54`, using built-in rules, all **reachable local refs**, full-history and merge-parent diffs, ignoring `gitleaks:allow` comments. This does not cover unfetched GitHub refs, dangling objects, ignored/untracked files or every future configuration. The earlier narrower run is superseded by this broader run, not counted as extra independent coverage.

```sh
gitleaks git --redact --no-banner --log-level fatal --ignore-gitleaks-allow --timeout 180 --report-format json --report-path /tmp/private-redacted-report.json --log-opts='--all --full-history -m' /path/to/checkout
```

Do not print raw matches. Inspect redaction, then retain only rule/file/line/commit/fingerprint and a safe assessment as done in the committed report. Even a redacted report should not be blindly committed: context/author fields can contain information unrelated to the finding.

## Results and triage

| Scope | Raw result | Assessment |
| --- | --- | --- |
| Reachable local Git history including merge diffs | **Exit 1, 32 generic-api-key matches** | 15 verified Git revision identifiers, 11 language-name references, 4 booking UI-state prose matches and 2 insurance lifecycle prose matches. All in documentation; no usable credential identified among these reported matches. **Not a clean-zero scanner result or proof of no historical secrets.** |
| Public build assets referenced by sampled Help/legal/status routes | **Exit 0, zero matches** | 27 direct owned assets, 1,129,537 bytes, actual deployed SHA `1f274d7aa9ebf697b950ecb5a1f6357df5e1c881`; exact URL/size/SHA-256 manifest retained. Not every private/lazy client bundle. |

The Git-reference classifications were checked with `git cat-file -t`; prose classifications were reviewed in their documentation context, not assumed safe merely because a file is Markdown. These generic-rule matches are not evidence of 32 leaked keys. Raw exit 1 is retained honestly; scanner settings were not weakened or matches deleted.

## Reproducing the sampled production-bundle check

First run `public-assets-smoke.py` against the exact intended live SHA. Then use `download-public-bundles.py` with that owned-asset result, expected SHA and a **new** temporary output directory. The downloader accepts only direct HTTPS `opetlife.ir/_next/static/` JS/CSS references, checks version before/after, refuses existing output directories, and caps files at 8 MiB each/32 MiB total. It performs no authenticated or mutating request. Do not commit the downloaded source bundle contents.

```sh
python docs/qa/tools/download-public-bundles.py --manifest /tmp/asset-check/results.json --expected-sha EXPECTED_SHA --output-dir /tmp/new-owned-bundles
gitleaks dir --redact --no-banner --log-level fatal --ignore-gitleaks-allow --timeout 120 --report-format json --report-path /tmp/private-redacted-bundle-report.json /tmp/new-owned-bundles
```

## Remaining security work

### Fresh release sample

After #241 deployed, the owned-asset download and Gitleaks directory scan were rerun against **`1a5b2c3b8d14615b18fdd613e6b0956d6fe9a31b`**: 27 direct assets, **1,129,579 bytes**, correct MIME, scanner exit 0 and zero matches. The new manifest is retained separately in `evidence/final-6-2026-11-10/live-1a5b2c3/bundle-manifest.json`. The first download encountered HTTP 503 and did not produce accepted scanner evidence; the complete independent retest above passed. This is still a bounded public-route sample, not all client bundles.

- Fresh production dependency audit still has **3 high and 7 moderate** findings; no critical finding in that registry snapshot. Reachability/major compatibility work remains; no blanket security-ready claim.
- GitHub reports Dependabot alerts disabled (403); enabling them needs approved owner/admin settings. This scan did not change those settings.
- Broaden to other fetched refs and private/lazy build outputs when safely available; rerun after relevant source/build/configuration changes. Do not attribute this old sample's zero matches to a newly built release automatically.
- Original memorial bucket/CDN/direct-source behavior, private production role/record flows and a real rollback/restore drill remain separately unverified. Neither scanning nor no-store public HTML proves complete media privacy or financial correctness.
