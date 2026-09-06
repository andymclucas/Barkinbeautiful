# Groomigo Sandbox Workflow Verification Plan

**Verification date:** 21 August 2026 (AEST)  
**Environment:** Groomigo managed sandbox and test-mode integrations  
**Purpose:** Provide evidence that the core operating workflows function as designed without sending client communications, collecting payment, or altering real client appointments or memberships.

## Safety boundary

The verification will use only automated regression tests, TypeScript/build validation, read-only data checks, and explicitly sandbox-safe workflow calls. The following actions are excluded: client SMS or email delivery, Stripe live collection, invoice sending, appointment deletion or rescheduling against production records, membership cancellation, and staff invitation delivery.

| Workflow area | Evidence to collect | Pass criterion |
| --- | --- | --- |
| Platform health | TypeScript validation, production build, server status | Validation and build complete without compilation failure; development service is responsive. |
| Calendar and appointments | Regression coverage for deletion undo, drag scheduling, staff columns, prior appointment detail and shared pricing | Covered workflows pass without modifying a live booking. |
| Workflow board | Date navigation, stage timers and workflow timing tests | Stage timing and selected-date workflow logic pass. |
| Online booking preview | Weight bands, groomer display, slots, capacity and preview-router tests | Size eligibility and capacity rules pass while preview safeguards prevent client messaging. |
| Membership and departed pets | Accounts receivable and departed-pet membership tests | Arrears/booking-hold and preservation/transfer safeguards pass without financial collection. |
| Restricted staff and grooming cards | Staff invitation, access and photo-storage tests | Invitation/access gates and storage controls pass without invitation delivery. |
| Messaging and payment safeguards | Email credential, inbound SMS, Stripe and reconciliation tests | Test-only or review-safe behaviour passes; no live sending or charging occurs. |

## Reporting convention

Each item will be reported as **Pass**, **Exception**, or **Not exercised**. A pass means the relevant automated test or non-destructive validation completed. An exception describes a known constraint or non-blocking issue; it is not represented as a client-impacting success. The final readiness report will separate confirmed working safeguards from items deliberately held in prototype or sandbox-only mode.
