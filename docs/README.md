# Engineering & QA notes — index

Dated working notes from the build, mostly August 2026. They are a **historical
record, not current specification** — where a note and the code disagree, the
code is right. They are kept because they capture *why* decisions were made, and
the account/provider details behind integrations.

Two naming notes for anyone reading these cold:

- **Groomigo** was the product's earlier / white-label name. Same system.
  `server/_core/sdk.ts` still carries the id `groomigo-self-hosted-password`.
- **MoeGo** is the commercial salon software the business migrated *away* from.
  "MoeGo recovery" notes are about extracting data out of it.

## Integrations — read these before touching payments or messaging

| Note | Subject |
| --- | --- |
| `stripe_sandbox_assessment_2026-08-27.md` | Stripe sandbox state assessment |
| `stripe_webhook_endpoint_audit_2026-08-27.md` | Which webhook endpoints are registered |
| `groomigo_stripe_payment_options_2026-08-17.md` | Payment options in test mode |
| `groomigo_stripe_membership_billing_prototype_2026-08-16.md` | Membership billing prototype |
| `groomigo_stripe_test_sandbox_inspection_2026-08-17.md` | Sandbox inspection record |
| `square_payment_integration_scope_2026-08-27.md` | Square as an alternative — scope only, not built |
| `groomigo_resend_sender_verification_2026-08-17.md` | Resend verified sender setup |
| `resend_domain_verification_working_notes_2026-08-26.md` | Resend domain (DNS/DKIM) verification |
| `moego_sms_analysis_and_recommendation.md` | SMS volume analysis and provider recommendation |
| `moego_sms_provider_pricing_comparison.md` | Provider pricing comparison |
| `sms_provider_pricing_research_notes.md` | Underlying pricing research |
| `moego_sms_usage_working_notes.md` | Raw MoeGo SMS usage figures |
| `nathan_email_provisioning_notes_2026-08-26.md` | Staff branded mailbox provisioning |

## Access control & staff

| Note | Subject |
| --- | --- |
| `groomigo_restricted_staff_access_2026-08-17.md` | The restricted-staff model — background for `operationalProcedure` vs `protectedProcedure` |
| `andy_staff_workflow_test_2026-08-26.md` | End-to-end restricted-staff walkthrough |

## Booking & pricing

| Note | Subject |
| --- | --- |
| `pricing-online-booking-integration-plan.md` | Pricing catalogue ↔ online booking integration plan |
| `online-booking-and-screen-access.md` | Online booking + multi-screen (TV mode) operations design |
| `groomigo_calendly_style_slot_picker_2026-08-14.md` | Slot picker QA |
| `groomigo_online_booking_weight_eligibility_2026-08-14.md` | Pet-weight eligibility rules |
| `groomigo_large_dog_booking_capacity_2026-08-14.md` | Large-dog capacity limits |
| `groomigo_online_booking_form_alignment_2026-08-14.md` | Booking form layout QA |
| `groomigo_online_booking_preview_2026-08-14.md` | Booking preview |
| `groomigo_six_band_preview_validation_2026-08-14.md` | Six-band preview validation |

## Workflow, calendar & memberships

| Note | Subject |
| --- | --- |
| `groomigo_client_readiness_report_2026-08-21.md` | Workflow readiness assessment |
| `groomigo_sandbox_workflow_verification_plan_2026-08-21.md` | Workflow verification plan |
| `groomigo_sandbox_workflow_verification_results_2026-08-21.md` | Results of that plan |
| `groomigo_workflow_stage_timer_qa_2026-08-14.md` | Stage timer QA |
| `groomigo_calendar_drag_recovery_2026-08-14.md` | Calendar drag-and-drop recovery |
| `groomigo_calendar_column_width_qa_2026-08-14.md` | Day-view column width |
| `groomigo_membership_accounts_receivable_2026-08-17.md` | Membership accounts receivable |
| `groomigo_departed_pet_membership_2026-08-15.md` | Departed-pet membership handling |
| `client_quick_preview_qa_2026-08-13.md` | Client quick-preview QA |
| `groomigo_white_label_qa_2026-08-13.md` | White-label and calendar QA |

## MoeGo data migration

| Note | Subject |
| --- | --- |
| `moego_pet_code_recovery_2026-08-20.md` | Pet code + groom-style recovery |
| `moego_recovery_working_notes_2026-08-25.md` | Manual recovery working notes |
| `moego_recovery_navigation_notes.md` | Navigating MoeGo's UI to extract data |

## Public marketing website

These concern the **public barkinbeautiful.com.au site**, not the staff app in
this repo. Kept for reference.

| Note | Subject |
| --- | --- |
| `barkin_beautiful_website_audit_notes.md` | Website audit |
| `barkin_beautiful_homepage_full_visual_qa_2026-08-17.md` | Homepage visual QA |
| `barkin_beautiful_homepage_header_qa_2026-08-17.md` | Header QA |
| `barkin_beautiful_homepage_hero_repair_2026-08-17.md` | Hero section repair |
| `barkin_beautiful_review_page_final_desktop_check_2026-08-27.md` | Desktop check |
| `barkin_beautiful_review_page_inspection_2026-08-12.md` | Review page inspection |
| `barkin_beautiful_review_page_photo_refresh.md` | Photo refresh |
| `barkin_beautiful_review_page_recovery_notes.md` | Recovery notes |
| `barkin_beautiful_protected_drafts_qa_2026-08-13.md` | Protected redesign drafts QA |
| `barkin_beautiful_mobile_review_2026-08-14.md` | Mobile QA |
| `barkin_beautiful_gallery_lightbox_qa_2026-08-13.md` | Gallery lightbox QA |
| `review_page_header_css_matches.txt` | Raw CSS grep output — scratch data |
| `evidence/` | Captured DOM and image URLs from the homepage QA |
