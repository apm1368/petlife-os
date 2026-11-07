# Public pet memorial workflow

This implements the existing owner decision U-02 without changing its privacy defaults.

The consent copy is versioned as `public-pet-memorial-v1`. Current English copy: “I explicitly
agree to display “{name}” and the selected photo publicly after admin approval.” Current Persian
copy: «صریحاً موافقم نام «{name}» و عکس انتخاب‌شده پس از تأیید ادمین به‌صورت عمومی نمایش داده شود.»
Any future material change to these strings must increment the server-side consent version;
the version is stored with the submission and appears in the admin review queue.

## Owner flow

Only the household owner can submit a memorial after the pet has been explicitly marked
`DECEASED` or `MEMORIAL`. The owner chooses a non-archived public photo already attached to
that pet's memory timeline, supplies the public display name, and checks a separate consent
box. At submission the API copies that image into an independently managed private
`pet-memorial-assets/<random-uuid>.<extension>` object; the source object and memory record are
not moved, deleted, or re-keyed. This phase does not infer consent, send a verification
message, or change the phone's verification state. A pending request is not public. The owner
can withdraw while review is pending or after publication; withdrawal immediately removes the
item from the public listing and makes the memorial asset alias return 404. The separate
publication copy is retained privately with its audit record. A withdrawn or rejected request
remains in the audit history.

The public endpoint returns only the submission ID, explicitly consented display name, and an
opaque image route. It does not return household IDs, pet IDs, owner IDs, notes, source URLs, or
other memories. The image route streams the separate private publication asset through the API
only while the submission remains published and the pet remains in the deceased/memorial
lifecycle. It does not redirect to either the source photo or the storage object URL. Responses
and the copied asset use `no-store` cache directives; each request rechecks publication state.
The underlying selected memory photo must already be marked public; this flow never silently
makes a private image public.

## Admin review

Trust & Safety users with `trust.view` can view a paginated pending queue; `trust.manage` is
required to approve or reject with a reason. Approval rechecks explicit consent, image type and
visibility, and pet lifecycle in the transaction. The workflow appends domain audit events and
the existing admin audit log. Domain audit events reject UPDATE and DELETE at the database
level. Concurrent owner withdrawal and admin review use conditional state transitions, so only
one can win; the losing request must reload and retry if appropriate.

## Privacy and limitations

- Publication is limited to 12 most-recent approved submissions on the landing endpoint.
- The memorial alias serves an independent private copy under an opaque key, and never returns
  the source URL or either storage key. The source image is still an independently public
  `PetMemory` asset: its original URL includes the pet ID and can remain accessible to anyone
  who already has or independently obtains that URL. Withdrawal revokes the memorial copy's
  alias; it does not change the source memory's public visibility or disrupt its timeline/admin
  uses, and cannot retract a downloaded or separately cached copy of the source image.
- The application-level local storage mount blocks `pet-memorial-assets/`, and
  `resolveObjectUrl()` refuses to create a public URL for it. Production uses the S3-compatible
  driver and the same private-key/signed-download boundary as health documents. The actual
  production bucket policy and CDN path rules are managed outside this repository and have not
  been inspected here; direct-edge denial for a guessed private asset URL must be verified by
  the infrastructure owner before describing the storage layer as fully private. The memorial
  API does not disclose the opaque asset key.
- The memorial feature and earlier redirect implementation have not been deployed to production
  (production still runs main `3ed6c598`), so there is no known production memorial redirect
  cache to purge. The earlier branch response also carried `no-store`; no CDN purge of the
  separate public source image was attempted because it remains public for its existing use.
- The currently supported application locales are fa/en. German and Spanish localization is a
  separate cross-application task; this addition does not claim that language expansion is done.
- No existing private memories are migrated, published, or modified.
