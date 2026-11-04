# Payment infrastructure (P1-a)

All persisted monetary amounts are integer Rial. `LedgerTransaction` and
`LedgerEntry` are append-only; balance views are derived from entries. An
accounting correction uses `LedgerService.reverse`, which creates a new,
opposite transaction with a mandatory reason and never updates the original.

## Payment rails

- **Zibal** uses request → redirect → verify. A redirect is not a successful
  payment; only a successful verify creates the gateway attempt and permits
  checkout finalisation. Request/verify transport failures are recorded as
  `UNKNOWN`, never treated as failed or paid. Operations reconcile the track
  ID in Zibal's dashboard before action; the customer-facing fallback is the
  separate card-to-card rail. Zibal has no automatic refund action here: an
  unverified/abandoned payment creates no order and the bank's normal 72-hour
  release applies (PY-04).
- **Card-to-card** snapshots the masked company-card number, holder and exact
  amount; receipt keys remain private storage keys. Receipt upload has a
  30-minute window. Review is unavailable before the next Tehran working
  period (Sat–Wed 09:00–18:00, Thu 09:00–13:00); its stock/slot hold survives
  to that review. Overpayment is credited to the personal withdrawable wallet.
  Underpayment opens a 30-minute difference window; expiry credits the amount
  received to the withdrawable wallet and releases the hold. Bookings less
  than 24 hours away are rejected at the domain service, not by UI hiding.
- **Wallet** has one personal account per user and two derived balances:
  `WITHDRAWABLE` (refunds) and `PURCHASE_ONLY` (top-ups/gifts). They are
  separate ledger liabilities. Gift credit expires after six calendar months;
  expiry is appended as a new wallet and ledger entry.

## Operations and safety

Gateway credentials are environment-only (`ZIBAL_MERCHANT`,
`ZIBAL_CALLBACK_URL`). No credential or card number is written to source
control or financial history. `ZIBAL_ENABLED` only enables the adapter;
payment method control switches are deliberately P1-b work.

The provider settlement entity is independent of seller settlement. It posts
to `PROVIDER_PAYABLE`, but does not introduce a settlement schedule or payout
executor; those are later operations work and can be gated without changing
the ledger.
