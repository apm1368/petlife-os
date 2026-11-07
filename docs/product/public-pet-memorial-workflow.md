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
box. This phase does not infer consent, send a verification message, or change the phone's
verification state. A pending request is not public. The owner can withdraw while review is
pending or after publication; withdrawal immediately removes the item from the public listing
and disables its image alias. A withdrawn or rejected request remains in the audit history.

The public endpoint returns only the submission ID, explicitly consented display name, and an
opaque image route. It does not return household IDs, pet IDs, owner IDs, notes, or other
memories. The image route streams the selected image through the API only while the submission
remains published and the pet remains in the deceased/memorial lifecycle. It does not redirect
to the legacy pet-scoped storage URL. Responses use `no-store` cache directives so withdrawal
or unpublishing blocks subsequent requests instead of leaving a cached redirect. The underlying
selected memory photo must already be marked public; this flow never silently makes a private
image public.

## Admin review

Trust & Safety users with `trust.view` can view a paginated pending queue; `trust.manage` is
required to approve or reject with a reason. Approval rechecks explicit consent, image type and
visibility, and pet lifecycle in the transaction. The workflow appends domain audit events and
the existing admin audit log. Domain audit events reject UPDATE and DELETE at the database
level. Concurrent owner withdrawal and admin review use conditional state transitions, so only
one can win; the losing request must reload and retry if appropriate.

## Privacy and limitations

- Publication is limited to 12 most-recent approved submissions on the landing endpoint.
- The image alias avoids exposing the pet ID or object key in the public listing and network
  redirect chain. The legacy source object still has a pet-scoped key internally; the API only
  reads that key server-side and never returns it to a visitor.
- The currently supported application locales are fa/en. German and Spanish localization is a
  separate cross-application task; this addition does not claim that language expansion is done.
- No existing private memories are migrated, published, or modified.
