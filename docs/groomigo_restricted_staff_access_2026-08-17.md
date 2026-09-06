# Groomigo Restricted Staff Access

## Purpose

Groomigo now supports operational staff accounts that are deliberately narrower than administrator accounts. Staff can view **only appointments assigned to them**, move their assigned pets through the workflow, and add before or after photos to each assigned pet’s grooming card from a phone. They cannot edit appointment details, access client records, membership, billing, reporting, staff administration, messages or any other management area.

## Administrator workflow

| Step | Administrator action | Staff result |
|---|---|---|
| 1 | Open a staff profile and select **Invite**. | A unique seven-day acceptance link is sent to the staff email address. |
| 2 | The staff member opens the link and creates their own password. | Their access status becomes **Awaiting approval**; they cannot sign in yet. |
| 3 | The administrator selects **Approve** on the staff profile. | The staff member can sign in to the restricted My Day portal. |
| 4 | If needed, the administrator selects **Revoke** or **Restore**. | Access stops or resumes without removing the staff member’s historical operational audit trail. |

Each invitation stores only a one-way token hash. The emailed raw link is never retained in the database. Invitation, acceptance, approval, revocation, workflow changes and grooming-card photo activity appear in the staff profile’s **Staff access activity** list.

## Restricted staff experience

The phone-friendly **My Day** portal shows the staff member’s assigned daily appointments as read-only cards. Each card has one workflow control that advances the pet to the next operational stage. The timing logic is the same workflow transition logic used elsewhere in Groomigo.

For grooming cards, staff can use **Before photo** or **After photo** on an assigned appointment. The browser opens the device camera when available. Uploads accept image files up to 20 MB, are stored through the project storage service, and are attached only to the exact pet on the assigned appointment. Upload and attachment requests both check that the staff account is approved and assigned to the appointment.

## Email configuration and safeguards

The Resend API credential has been validated against Resend’s authenticated domains endpoint without sending email. Invitation delivery is still administrator-initiated only: no invitation, client email, invoice or payment message is sent automatically. Before staff invitations are used, verify the selected sender domain in Resend so the configured `RESEND_FROM_EMAIL` is permitted to send.

Legacy staff profiles already linked to a prior portal account were retained as approved restricted staff accounts during the migration; newly invited staff must follow the invitation and approval path.
