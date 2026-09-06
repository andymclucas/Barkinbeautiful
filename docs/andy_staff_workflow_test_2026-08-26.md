# Andy McLucas Restricted Staff Workflow Test — 26 August 2026

## Safe invitation test state

An invitation test state was prepared for **Andy McLucas** at `mclucas.andy@gmail.com` without attempting email delivery. Invitation record `30001` is pending and expires on 02 September 2026. The raw one-time token is held only in a protected local temporary file and is intentionally not recorded in this document.

## Browser validation

The public staff-setup screen identifies Andy and the intended email address, presents separate create-password and confirm-password fields, and states that the account is inactive until administrator approval. It also states that staff can view assigned appointments, update workflow stages and upload grooming-card photos, while appointment editing and administrative areas remain excluded.

The empty-form validation was exercised. It prevented submission and showed the expected requirement that the password contain at least eight characters. No password was entered, no account was accepted, no staff access was approved and no invitation email was sent during this check.

## Account setup result

Andy subsequently completed the password-setup form. Invitation `30001` is now `accepted`; the password is configured and the linked account remains role `staff`. The staff profile is now `awaiting_approval`, with no approval timestamp. This confirms that password setup alone does not grant operational access: an administrator approval is still required before assigned appointments, workflow updates or grooming-card uploads can be used.
