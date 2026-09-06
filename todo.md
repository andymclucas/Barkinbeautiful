# GSOS — Grooming Salon Operating System

## Phase 1: Foundation
- [x] Design system tokens (colours, fonts, spacing) in index.css
- [x] Global DashboardLayout with sidebar navigation for all modules
- [x] App.tsx routing for all pages
- [x] Google Fonts (Inter) added to index.html

## Phase 2: Database Schema
- [x] tenants table (multi-tenant SaaS)
- [x] staff table with roles (owner, groomer, bather, receptionist)
- [x] clients table (linked to tenant)
- [x] pets table (linked to client)
- [x] appointments table with workflow_state enum
- [x] workflow_logs table (state change history for Pet Tracker)
- [x] memberships table (linked to pet + billing)
- [x] membership_payments table
- [x] invoices table
- [x] invoice_line_items table
- [x] retail_products table
- [x] retail_purchases table
- [x] timesheets table
- [x] pet_photos table
- [x] migration_jobs table

## Phase 3: Appointment Calendar
- [x] Multi-staff day view (columns per groomer)
- [x] Week and month views
- [x] Colour-coded appointments by staff member
- [x] Drag-and-drop rescheduling
- [x] New appointment modal (client, pet, service, staff, time)
- [x] Appointment status badges

## Phase 4: Live Workflow Board & Pet Tracker
- [x] Workflow Board UI (Kanban-style columns per stage)
- [x] Real-time state transitions (optimistic updates)
- [x] Pet Tracker public page (unique token URL)
- [x] Estimated pickup time display
- [ ] WebSocket real-time push (Socket.io) — planned for v2
- [x] SMS link generation on check-in — requires Twilio integration

## Phase 5: Client Portal & Memberships
- [x] Client list with search and add
- [x] Client detail (pets, appointment history, memberships)
- [x] Membership list with failed payment alerts
- [x] Membership engine: booking suspension on failed payment
- [x] Retail product catalogue with low-stock alerts
- [x] Client-facing portal login (separate from staff) — implemented as a separate administrator-controlled manual-setup account flow
- [x] Groom photos upload — secure S3 storage, client-profile gallery and upload controls

## Phase 6: Analytics, Staff & Migration
- [x] Analytics dashboard (revenue, staff productivity, KPIs)
- [x] Staff productivity report (appointments per groomer)
- [x] Staff management page (roles, clock-in/out)
- [x] Data migration: CSV import for clients
- [x] Data migration: MoeGo extraction UI
- [x] Migration job progress tracker UI
- [ ] Xero payroll sync — requires Xero OAuth integration
- [x] Average weeks between grooms metric — completed appointments only, shown in Analytics and CSV export

## Phase 7: Polish & Delivery
- [x] Responsive mobile layout
- [x] Loading states and empty states throughout
- [x] Toast notifications for key actions
- [x] TypeScript: zero errors
- [x] Tests: all passing
- [x] Checkpoint saved

## Phase 8–9: Pitch Deck
- [x] Pitch deck content written (vision, architecture, features, SaaS model, GTM)
- [x] Pitch deck slides generated

## Auth Overhaul
- [x] Add passwordHash column to users table
- [x] Add email/password login endpoint (tRPC auth.login)
- [x] Add logout endpoint (tRPC auth.logout)
- [x] Replace OAuth login page with email/password login form
- [x] Seed admin account: barkinbeautiful@hotmail.com.au / Keesha84!
- [x] Remove Manus OAuth dependency from login flow

## Data Migration (MoeGo → GSOS)
- [x] Extract all clients from MoeGo via API (10,078 clients)
- [x] Extract all pets from MoeGo via API (12,490 pets)
- [x] Extract all appointments (past + future) from MoeGo (13,395 appointments)
- [x] Extract all memberships and active subscriptions (153 active memberships)
- [x] Transform data to GSOS schema format
- [x] Import clients into GSOS database
- [x] Import pets into GSOS database
- [x] Import appointments into GSOS database
- [x] Import memberships into GSOS database
- [x] Verify record counts and data integrity

## Nav Redesign & Calendar Overhaul
- [x] Redesign sidebar nav: Appointments, Workflow, Memberships, Clients, Analytics, Staff, Payroll, Messages, Email Campaigns, Reporting
- [x] Appointments page: current-week calendar view pulling real data from DB
- [x] Appointments: edit appointment modal (reschedule, change service, change status)
- [x] Appointments: add new appointment from calendar
- [x] Workflow page: Kanban board wired to DB
- [x] Memberships page: list with real DB data
- [x] Clients page: list with real DB data
- [x] Analytics page: charts from real DB data
- [x] Staff page: staff management
- [x] Payroll page: placeholder / timesheet view
- [x] Messages page: placeholder
- [x] Email Campaigns page: placeholder
- [x] Reporting page: real data from DB (revenue, staff productivity, KPIs)

## Phase 10: Director-Requested Features (Aug 2026)
- [x] Groomer block-out UI on calendar (Block Out button, dialog, blockout banners in day view)
- [x] Groom style notes with history (DB table, backend procedures, Style Notes tab in Edit Appointment dialog)
- [x] Membership debt tracking (Debt Tracking tab, paid cycles vs grooms delivered, generate invoice button)
- [x] Fix missing logos in sidebar (re-uploaded Barkin Beautiful and Groomigo logos)
- [x] Pitch deck completed (roadmap_mid, roadmap_long, closing slides written)

## Phase 11: UX Improvements (Aug 2026)
- [x] Confirmation modal when deleting a block-out period (Calendar page)
- [x] Confirmation modal when deleting a style note (Edit Appointment Style Notes tab)
- [x] Search bar and sorting options for Membership Debt Tracking table
- [x] Export to PDF button for Groom Style Notes history

## Phase 12: Debt Tracking & Style Notes Enhancements (Aug 2026)
- [x] Add Mark as Paid button to Membership Debt Tracking table (backend procedure + UI)
- [x] Include business logo and contact info in Groom Style Notes PDF header
- [x] Add photo upload to Groom Style Notes (DB column, S3 upload endpoint, UI in Style Notes tab)

## Phase 13: Failed Payment Tracking & Calendar Next Appointment (Aug 2026)

- [x] Show next future appointment date on calendar appointment card (below service name)
- [x] Add payment_retry_scheduled_at column to memberships table
- [x] Email utility: sendTransactionalEmail helper
- [x] Backend: recordPaymentFailure procedure (increments counter, sets retry date, sends admin email on strike 1, sends client email on strike 2, suspends bookings on strike 2)
- [x] Backend: resolvePaymentFailure procedure (resets counter, clears suspension, restores active status)
- [x] Failed Payments tab on Memberships page (list all memberships with failed_payment_count > 0)
- [x] Heartbeat cron: daily job to find memberships with scheduled retry date = today and trigger retry notification

## Phase 14: Workflow Board & Client Profile (Aug 2026)
- [x] Workflow Board: full whiteboard-style table with all columns (time, cage, tag, dog, breed, membership, paid, service, bath, dry, groomer, stage, out)
- [x] Workflow Board: TV/kiosk display mode for salon TVs
- [x] Workflow Board: per-appointment stage advance/revert buttons
- [x] Workflow Board: inline editable cage and tag numbers
- [x] Workflow Board: per-appointment bath/dry/groomer staff selectors
- [x] Workflow Board: date picker to view any day's board
- [x] Workflow Board: stage progress bar showing dog distribution across stages
- [x] Add Akilah and Sabina as bathers to staff table
- [x] Client profile page: full details with contact, pets, appointment history, payment history, membership badges
- [x] Client profile: membership tier badges (diamond/platinum/gold/silver/bronze) on pet cards and header
- [x] Client profile: alert level indicators (danger/caution) on pet cards
- [x] Client profile: stats row (pets, appointments, active memberships, total spend)
- [x] Client profile: last visit and next upcoming visit display
- [x] Client profile: payments tab showing membership payment history
- [x] Grooming Report: Copy to All button, PDF preview modal, Groomer Notes textarea
- [x] Grooming Report: before/after photo upload
- [x] Grooming Report: completion indicator on pet tabs
- [x] Style Notes: per-pet tab switcher for multi-pet sessions
- [x] Style Notes: rich structured fields (service, blade, comb, head, face, ear, leg, tail, warnings, alert level)
- [x] Style Notes: Copy Last Style button
- [x] Multi-pet sessions: session_id grouping, grouped calendar card, per-pet groomer assignment
- [x] Fix groomer assignments: 10,732 appointments updated from MoeGo export data
- [x] Email Campaigns: full UI with campaign list, composer, audience targeting, send/schedule

## Phase 15: Timed Workflow, Multi-Screen Access & Online Booking Controls (Aug 2026)
- [x] Fix Workflow Board next-day navigation so it advances the selected AEST date correctly
- [x] Workflow Board: record per-stage start/completion times and total pet turnaround time
- [x] Workflow Board: add per-staff duration metrics (average bath, dry, groom and total time) to identify delays
- [x] Workflow Board: flag long stage or total durations for pricing-exception review
- [x] Workflow Board: provide display-only board mode for TV screens independent of front-desk workflows
- [x] Staff access: provide role-specific phone-friendly access to personal calendars and client messaging
- [x] Online booking foundation: admin controls, groomer capacity profiles, and server-side slot validation remain disabled by default
- [x] Online booking: add groomer profiles for client selection, per-groomer capacity limits, and bath-only booking caps
- [x] Online booking: enforce time-slot availability so bookings cannot overfill groomer capacity
- [x] Online booking: count every service that consumes shared bathing resources per time block
- [x] Online booking: add a real online booking validation-path test for shared bathing-capacity rejection

## Phase 16: MoeGo SMS Volume Analysis (Aug 2026)
- [x] Export MoeGo SMS activity from the current billing cycle back to the beginning of 2026
- [x] Analyse monthly SMS usage and disclose the sent/received reporting limitation
- [x] Recommend the right Groomigo messaging replacement based on observed volume and workflow needs
- [x] Compare current Australian SMS provider pricing using the observed MoeGo usage baseline
- [x] Verify provider pricing currencies and correct the SMS cost comparison

## Phase 17: SMS Workflow Completion (prototype, not client-sending)
- [x] Add delivery-status and template-type filters to SMS History
- [x] Process unambiguous inbound SMS appointment confirmations and cancellations into a review-safe workflow
- [x] Show a calendar indicator for appointments with a successfully delivered reminder SMS
- [x] Add an inbound SMS review queue with reply intent, linked appointment, processing state, and staff actions
- [x] Change inbound SMS handling so no reply updates an appointment without an explicit staff review action
- [x] Show linked appointment context and reviewer details for every inbound SMS review action
- [x] Add a dedicated pending inbound-replies review queue above SMS History

## Phase 18: Barkin Beautiful Public Website Overhaul
- [x] Audit all key public pages for dated styling, alignment defects, and mobile layout failures
- [x] Establish a modern boutique-grooming visual system and responsive page architecture
- [x] Rebuild the public website layouts as protected drafts while preserving existing business content and booking pathways
- [ ] Verify desktop and mobile alignment, usability, and accessibility before launch
- [x] Create an unpublished homepage redesign draft as the protected review page
- [x] Build the responsive homepage redesign content in the protected draft
- [x] Verify and preserve the live booking destination in the redesign draft before any homepage replacement
- [x] Restore original dog photography and Lauren’s founder portrait in the protected homepage redesign draft
- [x] Retain and modernise the original twenty-years message, service detail, gallery link, founder story, difference section and FAQs
- [x] Add subtle hover expansion and keyboard focus feedback to homepage interactive elements
- [x] Present the redesign draft for approval before changing the live homepage
- [x] Audit the live Services page and preserve its services, imagery and booking paths
- [x] Create and build an unpublished modern Services-page redesign draft
- [x] Verify the live Services-page booking destination and make every draft booking action match it exactly
- [x] Verify the live Services-page image assets and align the protected draft with the original visual content where appropriate
- [x] Replace Services draft image source attributes directly with the verified original Services-page asset URLs
- [x] Verify the original hero and all six service images render in the protected draft across desktop and mobile layouts
- [x] Verify the protected Services-page draft across desktop and mobile layouts
- [x] Present the Services-page redesign draft for approval before changing the live page
- [x] Audit the live Gallery page and preserve its real dog imagery, copy and booking path
- [x] Create and build an unpublished modern Gallery-page redesign draft
- [x] Verify the protected Gallery-page draft across desktop and mobile layouts
- [x] Present the Gallery-page redesign draft for approval before changing the live page
- [x] Audit the live About page and preserve Lauren’s founder story, imagery and booking path
- [x] Create and build an unpublished modern About-page redesign draft
- [x] Verify the protected About-page draft across desktop and mobile layouts
- [x] Present the About-page redesign draft for approval before changing the live page
- [x] Audit the live VIP Membership page and preserve accurate current tier information and contact-led signup path
- [x] Create and build an unpublished modern VIP Membership redesign draft without online membership sign-up controls
- [x] Verify the protected VIP Membership draft across desktop and mobile layouts
- [x] Present the VIP Membership redesign draft for approval before changing the live page
- [x] Correct the inherited Divi header whitespace and alignment on all protected redesign drafts
- [x] Verify the protected drafts’ revised header relationship across desktop and mobile layouts
- [x] Publish the homepage redesign as a separate public client-review page without replacing the current homepage
- [x] Verify the public review-page URL and provide it for client sharing
- [x] Verify the published review page’s mobile navigation visibility and hero-banner scaling after the semantic recovery update
- [x] Replace the homepage gallery-section title and supporting copy with the requested family-first messaging
- [x] Upload the six supplied dog photographs to WordPress and replace the published homepage review-page images without repeats
- [x] Replace every remaining homepage dog-image placement with a supplied photo or remove it from the review-page layout
- [x] Audit every rendered homepage dog-image placement to confirm the published review page has no repeated or legacy dog imagery
- [x] Capture the rendered public homepage DOM after image scripts run and verify the hero, service and gallery image mappings
- [x] Archive browser-executed DOM evidence for the protected homepage hero, service and gallery image mappings
- [x] Re-check the published review page’s desktop and mobile image layout for broken, repeated or empty visual slots
- [x] Re-verify the published review page in an actual mobile viewport after recovery and correct any mobile navigation or hero regressions without changing desktop styling
- [x] Replace the homepage gallery heading and paragraph in the actual page markup with the family-first copy, rather than relying on CSS pseudo-elements
- [x] Run a final desktop and mobile QA pass on the recovered published review page covering navigation, hero, content and image slots
- [x] Hide the unintended WordPress review-page title on mobile and realign the hero directly beneath the mobile navigation
- [x] Confirm on a real mobile device that the WordPress review-page title is hidden and the hero starts directly beneath the navigation
- [x] Re-test the published review page on mobile and desktop to confirm navigation visibility and hero spacing without regressions
- [x] Restore the Barkin Beautiful logo and light header background in the published review page’s mobile navigation fallback
- [x] Remove conflicting inherited mobile-header fallbacks and replace them with a self-contained review-page logo-and-navigation component
- [ ] Verify the rebuilt mobile review-page header in multiple mobile browsers before delivery
- [x] Insert an explicit mobile header with Barkin Beautiful logo and direct Home, Services, Gallery, About Us and VIP Membership links
- [x] Increase the published review-page header logo and navigation font sizes slightly across mobile and desktop without wrapping
- [x] Replace the legacy header logo with the intended current Barkin Beautiful logo asset and preserve its natural aspect ratio
- [x] Increase the intended logo and navigation scale again across mobile and desktop without wrapping or distortion
- [x] Upload the supplied high-resolution Barkin Beautiful logo and use it as the published review-page header logo without distortion

## Phase 19: Calendar Data-Loading Repair
- [x] Diagnose why calendar staff columns and the All Groomers dropdown are empty while appointment counts remain nonzero
- [x] Restore groomer option loading and assigned appointment rendering in day and week views
- [x] Add regression coverage for calendar staff and assigned appointment query results
- [x] Reconcile migrated appointment staff identifiers with active Groomigo staff records and expose any unmatched assignments for repair

## Phase 20: Staff Page Data-Loading Repair
- [x] Diagnose why the Staff page displays zero active team members despite active database staff records
- [x] Restore active staff cards and profile access from the Staff-page data source
- [x] Add regression coverage for active Staff-page data resolution

## Phase 21: Role-Grouped Calendar Columns
- [x] Sort calendar groomer columns alphabetically on the left and bathing-team columns alphabetically on the right
- [x] Add clear Groomers and Bathing Team section labels in the day calendar header
- [x] Add regression coverage for role-grouped calendar staff ordering

## Phase 22: Calendar Last Appointment Detail
- [x] Return each calendar pet’s prior completed appointment date from the appointment data procedure
- [x] Display Last Appointment in appointment hover details and click-through appointment information
- [x] Add regression coverage for prior completed appointment date resolution

## Phase 23: White-Label Visual System Overhaul
- [x] Audit shared Groomigo theme, layout and page-level interaction patterns
- [x] Build persistent white-label brand tokens for salon primary, accent and sidebar colours
- [x] Refresh shared navigation and dashboard with modern colour hierarchy and hover feedback
- [x] Add brand configuration controls and ensure selected salon colours propagate throughout the platform
- [x] Verify refreshed interaction states, accessibility and responsive presentation

## Phase 24: Distinctive White-Label Experience
- [x] Add custom salon-logo upload to Settings Branding and persist the selected salon logo
- [x] Add persistent custom font-family selection to Settings Branding and apply it throughout the platform
- [x] Add polished transitions, contextual hover guidance and a New Appointment quick-action cluster to the dashboard
- [x] Redesign the calendar toolbar, staff groups and appointment cards with stronger colour hierarchy, readable density and interaction feedback
- [x] Test custom branding persistence and core dashboard/calendar visual interactions

## Phase 25: Client Quick Preview Positioning
- [x] Position client quick previews adjacent to the hovered client name on desktop with safe viewport boundaries
- [x] Preserve accessible client preview details and a usable small-screen fallback

## Phase 26: Protected Draft Handset QA
- [x] Validate Services, Gallery, About and VIP Membership protected drafts in a handset mobile viewport
- [x] Confirm mobile header, hero, image loading, content flow and contact or booking pathways for each draft
- [x] Retain the scoped responsive treatment after full review, leaving live public pages unchanged
- [x] Record the full-page mobile QA result and protected-draft review readiness

## Phase 27: Shareable Protected Draft Review Links
- [x] Create mobile-shareable review-only routes for the Services, Gallery, About and VIP Membership redesign drafts
- [x] Verify each review route opens without WordPress authentication and does not replace its live public page

## Phase 28: Gallery Full-Size Image Expansion
- [x] Make every Gallery redesign image open in a scoped full-size lightbox
- [x] Support tap or click opening plus keyboard and close controls without altering the live Gallery page

## Phase 29: Services Image De-duplication
- [x] Replace the repeated bandana-dog photo in the Services redesign review page with a unique existing dog image
- [x] Verify every Services review-page visual placement is distinct and the original live Services page remains unchanged

## Phase 30: Readable Scrollable Calendar Columns
- [x] Widen day-calendar staff columns so appointment cards can show their key details without severe truncation
- [x] Preserve time-grid alignment, role-group headers and drag interactions while allowing horizontal access to all team columns
- [x] Verify desktop and responsive day-calendar behaviour with the wider column layout

## Phase 31: Gallery Mobile Grid Alignment
- [x] Remove the blank tile and align all Gallery review-page images into a consistent mobile grid
- [x] Preserve Gallery image expansion and leave the original live Gallery page unchanged

## Phase 32: Gallery Mobile Face-Centred Crops
- [x] Centre mobile Gallery image crops so every dog face remains visible
- [x] Add one existing dog image to complete the sparse mobile Gallery row
- [x] Preserve the review-page lightbox and original live Gallery page isolation

## Phase 34: Gallery Missing Completion Tile Repair
- [x] Replace the non-rendering dynamic Gallery completion tile with a persisted image tile in the review-page markup
- [x] Verify the repaired mobile Gallery grid includes every image and retains full-size expansion

## Phase 35: Gallery Per-Image Face Focal Points
- [x] Supersede per-image crop focal positions with a full-bleed natural image layout that keeps every dog face visible
- [x] Verify all desktop and mobile Gallery tiles retain visible dog faces and full-size expansion

## Phase 36: Gallery Face-Preserving Tile Layout
- [x] Replace aggressive fixed Gallery crops with a face-preserving natural image treatment on the review page
- [x] Verify all Gallery dog faces remain visible while retaining neat tile alignment and full-size expansion

## Phase 37: Gallery Full-Bleed Face-Safe Refinement
- [x] Remove the rejected padded image-fit treatment from the Gallery review page
- [x] Restore polished full-bleed image tiles with face-safe natural proportions and retained image expansion

## Phase 38: Online Booking Pet-Weight Service Eligibility
- [x] Define Small 0–10kg, Small–Medium 11–13kg, Medium 14–16kg, Large 17–25kg, Extra Large 26–35kg and Giant 36–80kg booking bands
- [x] Filter online booking service choices by the selected pet's stored weight and show a clear missing-weight prompt
- [x] Enforce pet-weight service eligibility server-side and cover all size-band boundaries with tests

## Phase 39: Test-Ready Online Booking Preview
- [x] Configure at least one existing groomer with a preview-safe online booking profile while keeping global booking release disabled
- [x] Add a visible preview-mode safeguard that prevents any client messaging or automatic confirmation
- [x] Exercise guest booking requests across all six pet-weight bands and verify pending appointment creation
- [x] Provide a protected preview path and testing guidance for safe staff-led test runs

## Phase 40: Online Booking Form Alignment
- [x] Correct the weight, service and requested-date field grid so controls do not overlap or visually collide
- [x] Verify the booking preview form remains aligned at desktop and mobile widths with a size-banded service selected

## Phase 41: Full Preview Groomer Picker
- [x] Configure every active groomer for protected online booking preview selection
- [x] Display groomer choices by first name only in the preview booking interface
- [x] Verify all available groomers appear in the preview without releasing the public booking route

## Phase 42: Calendly-Style Online Booking Availability
- [x] Generate only valid booking slots for the selected groomer, service and pet-weight band
- [x] Replace free-form time entry with date selection and an available-time picker in the protected preview
- [x] Revalidate selected slots at request creation and cover capacity, duration and size-band boundaries with tests

## Phase 43: Administrator Calendar Appointment Deletion
- [x] Add an administrator-only delete control to the calendar appointment detail panel
- [x] Require confirmation before deleting and retain a clear error or success state
- [x] Refresh calendar data after deletion and cover permission and deletion behaviour with tests

## Phase 45: Large-Dog Online Booking Capacity
- [x] Limit Large, Extra Large and Giant Classic or Styled Groom online bookings to one per groomer in the morning and one in the afternoon
- [x] Limit Large, Extra Large and Giant Classic or Styled Groom online bookings to a salon-wide maximum of three each day
- [x] Filter unavailable slots and enforce per-groomer half-day and salon-wide daily large-dog limits during final preview booking creation with tests

## Phase 44: Drag-and-Drop Appointment Recovery
- [x] Locate and restore Link McLucas’s appointment after the reported cross-groomer drag-and-drop issue
- [x] Correct calendar drag-and-drop reassignment so appointments remain visible after a move
- [x] Add regression coverage for cross-groomer appointment moves and visible calendar placement

## Phase 33: Live Workflow Stage Timers
- [x] Show a live elapsed-time tracker beside every active workflow stage
- [x] Start timers on stage entry and stop and persist durations when pets move to the next stage
- [x] Verify timers render and record correctly across all workflow stage transitions

## Phase 46: Appointment Deletion Undo
- [x] Add a deletion-success toast with a time-limited Undo action for calendar bookings
- [x] Restore the exact appointment and shared-session records when Undo is selected within the allowed window
- [x] Cover delete-and-undo behaviour with focused regression tests

## Phase 47: Automated Six-Band Booking Preview Validation
- [x] Automatically submit controlled preview requests for 10kg, 11kg, 14kg, 17kg, 26kg and 36kg dogs without client messaging
- [x] Verify the eligible service, available slot and pending appointment record for each booking band
- [x] Record a detailed, staff-readable test result for each of the six controlled preview bookings

## Phase 48: Protected Review Pages Mobile Optimisation
- [x] Review the Services, Gallery, About and VIP Membership review pages in a handset-size viewport
- [x] Retain the existing scoped responsive treatment after review, preserving original live public pages
- [x] Verify mobile navigation, images, content flow and booking or contact paths across every protected review page

## Phase 49: Administrator Workflow Stage Controls
- [x] Add an administrator dropdown for manually selecting every workflow stage on the operational board
- [x] Route dropdown changes through the existing workflow timing transition logic
- [x] Verify that manual stage selection starts, stops and records stage durations correctly

## Phase 50: Departed-Pet Membership Management
- [x] Add a departed-pet status that retains the pet’s client, grooming and membership history
- [x] Let administrators remove a departed pet from its membership without deleting historical records
- [x] Let administrators transfer a membership only to an eligible replacement pet in the same configured weight band
- [x] Record an administrator-visible audit trail for every departure, membership removal and replacement transfer
- [x] Add client-profile controls, confirmation guidance and regression coverage for each pathway

## Phase 51: Departed-Pet Workflow Refinements
- [x] Add a visually distinct memorial treatment to departed pet cards for immediate staff recognition
- [x] Add an in-flow replacement-pet creation action to the membership transfer dialog
- [x] Add a final confirmation summary that clearly states the selected membership action and future billing impact
- [x] Cover the enhanced replacement eligibility and confirmation behaviour with regression tests

## Phase 52: Client Profile Hook-Order Crash Repair
- [x] Diagnose the production React error when opening a client profile
- [x] Correct the hook-order violation without removing departed-pet membership controls
- [x] Add regression coverage and validate the client-detail component’s loading-to-data hook sequence

## Phase 53: Client Profile Workflow Feedback
- [x] Add an animated client-profile loading skeleton that mirrors the header, summary and pet-card layout
- [x] Add an administrator quick-action menu in the profile header for departed-pet membership management
- [x] Present membership transfer, removal and departed-pet events as a readable client activity history
- [x] Add focused regression coverage and validate the enhanced client-profile experience

## Phase 54: Stripe Membership Billing Integration
- [x] Enable Stripe integration scaffolding without enabling live client charges
- [ ] Map existing MoeGo-derived membership billing records to Stripe-safe customer and subscription reference fields
- [x] Add an administrator-visible prototype billing connection status and reconciliation safeguards
- [x] Document the required Stripe account connection and controlled live-transition steps

## Phase 55: Membership Accounts Receivable and Invoice Drafts
- [x] Reconcile each membership’s paid-to-date amount against the value of completed member grooms
- [x] Show due, grace-period, declined and cancelled membership states with an actionable arrears amount
- [x] Create clear, reviewable draft invoices for membership shortfalls without automatic sending or collection
- [x] Add booking-hold visibility when completed-groom value exceeds membership payments
- [x] Cover payment, groom-value, arrears and invoice-draft calculation scenarios with regression tests

## Phase 56: Shared Appointment Hover Pricing
- [x] Return each linked pet’s service price for shared calendar appointments
- [x] Show a clear per-pet price breakdown and combined total in the appointment hover detail
- [x] Cover shared-appointment pricing display logic with regression tests

## Phase 57: Protected Homepage Hero Image Repair
- [x] Restore the missing hero dog image on the separate Barkin Beautiful homepage review page
- [x] Verify desktop and handset hero visibility and alignment after the repair
- [x] Preserve the existing live homepage unchanged and record the protected-page-only correction

## Phase 58: Restricted Staff Accounts and Grooming Cards
- [x] Add an approval-gated restricted staff role and email-invitation record with a unique expiry-bound acceptance link
- [x] Add administrator invite, approval, revocation and staff-access audit controls
- [x] Restrict staff accounts to read-only appointments and editable workflow-stage operations only
- [x] Enable mobile grooming-card photo uploads for staff within their assigned appointment context
- [x] Add invitation, approval, permission and upload regression coverage; validate Resend credentials while keeping delivery administrator-initiated only

## Phase 59: Resend Invitation Sender Verification
- [x] Inspect the configured Resend account and sending-domain status
- [x] Complete available domain-verification actions without sending staff or client email
- [x] Record the exact DNS action required before invitation delivery

## Phase 60: Stripe Payment Options
- [x] Inspect the connected Stripe sandbox and confirm payment-method availability without enabling live collection
- [x] Add hosted Stripe Checkout for one-off invoice settlement and membership payment collection
- [x] Add Stripe customer, payment-link and payment-history references without storing card data
- [x] Add verified webhook handling for completed or failed Stripe payment events and membership status reconciliation
- [x] Add staff-visible payment status and safe manual or cash recording controls
- [ ] Validate all payment flows in Stripe test mode and document the live-transition safeguards

## Phase 61: Stripe Test Webhook Registration
- [x] Register the published Groomigo endpoint for Stripe test-mode completed-checkout and failed-payment events
- [x] Validate the registered destination without creating a client charge or sending a message

## Phase 62: Isolated Stripe Sandbox Checkout Verification
- [x] Create and settle one clearly labelled test-only reviewable invoice through hosted Stripe test Checkout
- [x] Verify the completed-payment webhook is delivered and reconciles the isolated test record only
- [x] Remove or clearly retain the isolated test record as a non-client audit item without enabling live billing
- [x] Run the confirmed 27 August controlled Stripe test-mode Checkout using an isolated non-client audit record only

## Phase 63: Stripe Sandbox Webhook Secret Repair
- [x] Verify the suspected duplicate manually created Stripe sandbox webhook destination is not present in the current test account, so no deletion is required
- [x] Retain the single verified Groomigo sandbox webhook destination rather than re-registering and risking the working test endpoint
- [x] Confirm the existing sandbox endpoint accepted the isolated completed-checkout test event without client charges, live invoices or messaging

## Phase 64: Payment Gateway Direction
- [x] Preserve Stripe implementation strictly as an inactive sandbox prototype with no live collection or client messaging
- [x] Scope the planned Square payment implementation before enabling a production payment gateway

## Phase 65: Protected Homepage Header Restoration
- [x] Restore a clear desktop header on the protected Barkin Beautiful homepage review page
- [x] Strengthen the protected handset logo and direct-link treatment without wrapping
- [x] Verify desktop and handset header presentation alongside full-page content and image slots

## Phase 66: MoeGo Pet Code and Groom-Style Recovery
- [ ] Audit available MoeGo exports and portal records for pet codes, behaviour alerts, clip details and groom-style history
- [ ] Preserve recovered MoeGo text as source data and map recognised terms into Groomigo structured grooming notes
- [ ] Import recoverable records without overwriting existing Groomigo notes and flag ambiguous rows for review
- [ ] Provide an administrator-visible recovery summary and unresolved-data report

## Phase 67: Manual MoeGo Groom-Style Import
- [ ] Recover verified pet-code, clip, alert and style records directly from authenticated MoeGo pet and appointment views
- [ ] Import each verified record into Groomigo with original MoeGo source text retained for traceability
- [ ] Flag unavailable or ambiguous historic style records for administrator review rather than guessing
- [x] Complete and verify the initial manual import batch for Desiree Mcconnon’s four pets and Catherine Hindley’s Boo and Button records
- [x] Complete and document the next manual import batches for Chris Roulstone, Marcelle Arkadieff and Ray Phillips active pets
- [x] Complete and document manual recovery batches for Renee Gannon, Mike Graham, Greg Lisa, April Bradstreet and Janene Bosa active pets
- [x] Complete and document manual recovery batches for Debbi Peterson, Toni Constantini and Geri Munnich active pets
- [x] Complete and document manual recovery batches for Marie Hodson and Allyson Warner active pets
- [x] Complete and document manual recovery batches for Kristy Hemmings and Elizabeth Bell active pets
- [x] Complete and document manual recovery batches for Dee Curtis and Thao Ashford active pets
- [x] Complete and document the Nicole Sofianos manual recovery batch for Winter and Cleo
- [x] Complete and document manual recovery batches for Delia Spri and Tricia Taylor active pets
- [x] Complete and document the Emily Raphael manual recovery batch for Lollie and Louie
- [x] Complete and document the Carly Herbert manual recovery batch for Alfie and Lily
- [x] Complete and document the Annie McLeod manual recovery batch for active pet Tommy
- [x] Complete and document the Julie Noy manual recovery batch for Rosie, Teddy and Tyson
- [x] Complete and document the Nicki Waldon manual recovery batch for Snickers and Chester
- [x] Complete and document the Andrea Tomlin manual recovery batch for Jaxon, Ellie and Abbie
- [x] Complete and document the Melinda Collinge manual recovery batch for Pearl and Raff
- [x] Complete and document the Emma Cecchin manual recovery batch for Rylai and Jasper
- [x] Complete and document the Rachel Schofield manual recovery batch for Belle, Teddy and Stella
- [x] Complete and document the Phillipa Perlin manual recovery batch for Masie, Luke and Leia
- [x] Complete and document the Josh Morgan manual recovery batch for Boo, Milly and Kaiser
- [x] Complete and document the Louise Sillar manual recovery batch for Margaret and Bob
- [x] Complete and document the Mellissa Luckman manual recovery batch for Neymar, Junior and Alex
- [x] Complete and document the Scott Barker manual recovery batch for Effie and Dusty
- [x] Complete and document the Vorn Reddell manual recovery batch for Ralph, Lola and Charlie
- [x] Complete and document the Annabel Prefontaine manual recovery batch for Luna and Ellie
- [x] Complete and document the Annie and Geoff Gerard manual recovery batch for Penny, Shirley, Penelope Pender and Agnes
- [x] Complete and document the Sonia Condon manual recovery batch for Harvey and Ella
- [x] Complete and document the Greg Blackaby manual recovery batch for Ruby and Charlie
- [x] Complete and document the Clare De Looze manual recovery batch for Teddy
- [x] Complete and document the Varinia Taylor manual recovery batch for Torah and Louis
- [x] Complete and document the Denise Egan manual recovery batch for Teddy
- [x] Complete and document the Adam Lothian manual recovery batch for Rufus and Mahli
- [x] Complete and document the Helene Llynn manual recovery batch for Ivy and Bailey
- [x] Complete and document the Mary Smithson manual recovery batch for Eddie and Murphy
- [x] Complete and document the Brook Davidson manual recovery batch for Coco, Ginger and Pepsi
- [x] Complete and document the Linda Alston manual recovery batch for Lulu and Gracie
- [x] Complete and document the Selina Robson manual recovery batch for Rocky and Archie
- [x] Complete and document the Kahni McGill manual recovery batch for Leo and Astrid
- [x] Complete and document the Angela Pobje manual recovery batch for Lexi, Lena and Raya
- [x] Complete and document the Lorraine Buchan manual recovery batch for Rea and Jerry
- [x] Complete and document the Alana Murphy manual recovery batch for Dougal and Chase
- [x] Complete and document Bev Price’s verified Koby and Dudley recovery sub-batch
- [x] Complete Bev Price’s full active-pet recovery review, including verified no-data outcomes for Yowie, Queenie, Kora and Jimmy
- [x] Complete and document the Georgie Makepeace manual recovery batch for Toby and Josie
- [x] Complete and document the Lynnette Matuschka manual recovery batch for Jackson and Elle-May
- [x] Complete and document the Renee Johnston manual recovery batch for Indy and Daisy
- [x] Complete and document the Bev Somers manual recovery batch for Ruby and Lola
- [x] Complete and document the Gary Hexter manual recovery batch for Theodore and Rosie
- [x] Complete and document the Sam Costa manual recovery batch for Yuki, Lucy, Shooka Navabi and Leo
- [x] Complete and document the Jana Finch manual recovery batch for Waffle and Maisy
- [x] Complete and document the Ellie Jones manual recovery batch for Cosmo
- [x] Complete and document the Amanda Mckenzie manual recovery batch for Tango and Oscar
- [x] Complete and document the Kylie Burger manual recovery batch for Marlowe and Koda
- [x] Complete and document the Kerri Torry manual recovery batch for Louie
- [x] Complete and document the Barbara Bou-Samra manual recovery batch for CoCo and Winston
- [x] Complete and document the Jodie Brown manual recovery batch for Abby and Ollie
- [x] Complete and document the Kara Hunter manual recovery batch for Ziggy
- [x] Complete and document the Naomi Brookfield manual recovery batch for Twirly, Rosie and Bella
- [x] Complete and document the Chistel Kotnee manual recovery batch for Dasher, Coco and Chico
- [x] Complete and document the Jackie Hartney manual recovery batch for Eddy and Albert
- [x] Complete and document the Christina Nogaski manual recovery batch for Beau
- [x] Complete and document the Casey Lindsay manual recovery batch for Reeve and Nelson
- [x] Complete and document the Tran Nguyen manual recovery batch for Archie and George
- [x] Complete and document the Carole Adams manual recovery batch for Charlie and Spencer
- [x] Complete and document the Cliff Stockley manual recovery batch for Oliver and Tammy
- [x] Complete and document the Deborah Logan manual recovery batch for Lilly and Freya
- [x] Complete and document the Meabh O'Carroll manual recovery batch for Charlie and Archie
- [x] Complete and document the Tracey Albury manual recovery batch for Winston and Enzo
- [x] Complete and document the Kylie Scrivener manual recovery batch for Bear
- [x] Complete and document the Natalia Miller manual recovery batch for Shiraz
- [x] Complete and document the Kate Condon manual recovery batch for Minnie and Molly
- [x] Complete and document the Stellina Popplewell manual recovery batch for Luna and Freddi
- [x] Complete and document the Jo Roberts manual recovery batch for Mischa, coco and Bear
- [x] Complete and document the Ruth Weaver manual recovery batch for Maggie
- [x] Complete and document the Debbie Jeffries manual recovery batch for Bella, Marshy and Vada
- [x] Complete and document the Louise Dury manual recovery batch for Waffle
- [x] Complete and document the Janet Campbell manual recovery batch for Max and Lucy
- [x] Complete and document the Lee Givney manual recovery batch for Smidge
- [x] Complete and document the Joanne Speck manual recovery batch for Jamie and Cleo
- [x] Complete and document the Kiley McDonald verified no-data recovery batch for Zahli and Zander
- [x] Complete and document the Kerry Harris manual recovery batch for Maxi and Frankie
- [x] Complete and document the Scott Young manual recovery batch for Hugo and Jethro
- [x] Complete and document the James and Shandell Riley manual recovery batch for Eddie and Lola
- [x] Complete and document the Kim Staley-Biggs manual recovery batch for Oakley
- [x] Complete and document the Rachel Masterman manual recovery batch for Albie
- [x] Complete and document the Roseanne Davies manual recovery batch for Sadie
- [x] Complete and document the Elaine Fogg manual recovery batch for Lilly and Arlo
- [x] Complete and document the Brendon Byth manual recovery batch for Bella
- [x] Complete and document the Kylie Brumwell manual recovery batch for Gizmo
- [x] Complete and document the Lauren Tucker manual recovery batch for Alfie
- [x] Complete and document the Nakomah Bates manual recovery batch for Evie and Rui
- [x] Complete and document the Donna Hurren verified no-data recovery batch for Versace
- [x] Complete and document the Peter Brabant manual recovery batch for Ishkah
- [x] Complete and document the Paris Manteit manual recovery batch for Raven and Nova
- [x] Complete and document the Kim Dahl manual recovery batch for Beau and Ralph
- [x] Complete and document the Tonja Aitken manual recovery batch for Blits and Molly
- [x] Complete and document the Linda Schreurs manual recovery batch for Arlo
- [x] Complete and document the Denise Partis manual recovery batch for Maddie and Misha
- [x] Complete and document the Trudi Kennedy manual recovery batch for Tilly and Dusty
- [x] Complete and document the Marie Mason manual recovery batch for Louis and Teddy
- [x] Complete and document the Lisa Smith manual recovery batch for Alfie and Zali
- [x] Complete and document the Jen Cardaci manual recovery batch for Banjo and Freddie
- [x] Complete and document the Cheryl Schmidt manual recovery batch for Archie and Lola
- [x] Complete and document the Marisa Hopper manual recovery batch for Alfie, Bingo and Minnie
- [x] Complete and document the Chris Auld manual recovery batch for Lola and Poppy
- [x] Complete and document the Len Fehlhaber manual recovery batch for Alfie and Daisy
- [x] Complete and document the Tracey Mckee manual recovery batch for Bartlet and Missy
- [x] Complete and document the Dianne English manual recovery batch for Ziva and Zola
- [x] Complete and document the Noreen Cicala manual recovery batch for Luka
- [x] Complete and document the Sibel Allan Jones manual recovery batch for Daisy
- [x] Complete and document the Julie Holder manual recovery batch for Maggie
- [x] Complete and document the Peter Burchell manual recovery batch for Willow
- [x] Complete and document the Kaitlyn Dawe manual recovery batch for Billie and Dexter
- [x] Complete and document the Alisa Luck manual recovery batch for Beau, Dusty, Teddie and Woody
- [x] Complete and document the Kayla Fellingham manual recovery batch for Jemima and Teacup
- [x] Complete and document the Rachael Heigan manual recovery batch for Appa and Momo
- [x] Complete and document the Janelle Mehrten manual recovery batch for Miska
- [x] Complete and document the Megan Duggan manual recovery batch for Ellie
- [x] Complete and document the Marjorie Connole manual recovery batch for Coco and Gigi

## Phase 68: Sandbox Workflow Verification and Client Readiness Report
- [x] Define safe pass criteria covering appointment, workflow, membership, staff-access and payment safeguards
- [x] Run the automated regression suite and type validation in the sandbox environment
- [x] Verify core workflow endpoints and safety gates without sending messages, charging cards or changing client records
- [x] Produce a client-ready workflow readiness report with test evidence, results and known exceptions

## Phase 69: Membership Client Navigation and Preview
- [x] Make the client name in each membership record navigate directly to the matching client profile
- [x] Add an accessible membership-table hover preview with client contact details and associated pets
- [x] Add regression coverage and responsive verification for the membership profile link and preview

## Phase 70: Calendar Drag Drop-Target Highlight
- [x] Highlight the active groomer-and-time destination while an appointment is dragged
- [x] Preserve timezone-safe drag scheduling and clear the highlight on cancel or drop
- [x] Add regression coverage and responsive verification for the drag destination feedback

## Phase 71: Workflow Board Cage and Tag Entry Visibility
- [x] Give Cage and Tag entry cells a distinct, accessible visual treatment so staff can identify editable data fields immediately
- [x] Preserve mobile layout, workflow row alignment and existing Cage and Tag update interactions
- [x] Add focused regression coverage and visual verification for the enhanced entry treatment

## Phase 80: Appointment Alert Signal Refinement
- [x] Suppress non-actionable `Pet Alert: Ok` labels across appointment surfaces
- [x] Preserve visible genuine pet alerts and handling or care warnings that require staff attention
- [x] Add regression coverage and visually verify appointment alert presentation without changing appointment or pet source data

## Phase 81: Groomer Header and Last Groom Style Snapshot
- [x] Show the assigned groomer in the client-ready Grooming Card header
- [x] Surface one clear last completed groom-style snapshot per pet, separate from the full historical style-note list
- [x] Let staff review the last style before creating or updating a new groom style without overwriting historical records
- [x] Add regression coverage and visually verify the last-style snapshot, groomer header and history separation

## Phase 79: Next Ranked Manual MoeGo Recovery
- [x] Capture the next ranked read-only candidate queue before individual pet inspection
- [x] Complete and document the Pam Hill manual recovery batch for Beau
- [x] Complete and document the Maggie Reeves manual recovery batch for Bella and Buster
- [x] Complete and document the Tracey Mckee recovery reconciliation for Bartlet and Missy, retaining pre-existing rows without overwrite
- [x] Complete and document the Kylie Brumwell recovery reconciliation for Gizmo, retaining the existing source-preserved row without overwrite
- [x] Complete and document the Lauren Tucker recovery reconciliation for Alfie, retaining the existing row and flagging the newly observed 13mm head instruction without overwrite
- [x] Complete and document the Nakomah Bates recovery reconciliation for Evie and Rui, retaining existing source-preserved rows without overwrite
- [x] Complete and document the Mary Smithson recovery reconciliation for Eddie and Murphy, retaining existing source-preserved rows without overwrite
- [x] Complete and document the Beate O'Neil recovery batch for Phoenix, with one guarded source-preserving recovery row and no unsupported structured mapping
- [x] Complete and document the Geraldine Fredricks recovery reconciliation for Newman, retaining the existing source-preserved row without overwrite
- [x] Complete and document the Lisa Kaniyur recovery reconciliation for Toffee, retaining the existing source-preserved row without overwrite
- [x] Complete and document the Annette Ash all-deactivated-pet recovery exclusion without any Groomigo data action
- [x] Complete and document the Dorit Skomoroch recovery reconciliation for Remi, retaining the existing source-preserved row without overwrite and excluding deactivated Cory
- [x] Complete and document the Lauren Forword recovery reconciliation for Buddy and Bella, retaining existing source-preserved rows without overwrite
- [ ] Complete Jacinta Ljubas’s next ranked MoeGo recovery batch through read-only source review, exact tenant-1 matching and no-overwrite reconciliation

## Phase 81: Client-Ready Grooming Cards
- [x] Create a branded client grooming-card layout from completed grooming reports, including session outcome, mood, pet-condition checks, care recommendation, frequency and photos
- [x] Preserve each grooming report’s existing per-pet details, photos and PDF preview while presenting client-safe content only
- [x] Add a manual, review-first client delivery action without enabling automatic SMS or email delivery
- [x] Add regression coverage and verify the completed-card, preview and manual-delivery safeguard flows

## Phase 82: Andy McLucas Restricted Staff Test Access
- [x] Add an approved, non-administrator Andy McLucas staff profile for restricted appointments and workflow testing

## Phase 83: Andy McLucas Staff Invitation Reset
- [ ] Revoke Andy McLucas’s direct staff access and send a fresh approval-gated account-creation invitation to the saved email address
- [ ] Support safe reinvitation and password setup for a revoked staff profile whose email already has a Groomigo account

## Phase 84: Barkin Beautiful Resend Domain Verification
- [x] Configure and verify the Barkin Beautiful email-sending domain in Resend without disrupting existing DNS or mail delivery

## Phase 85: Andy McLucas Restricted Staff Workflow Test
- [x] Validate Andy McLucas’s restricted staff invitation, account-setup and approval-gated access flow without enabling premature operational access

## Phase 86: Owner Sign-In Staff Role Preservation
- [x] Prevent owner identity synchronization from silently restoring administrator access to an approved linked staff account

## Phase 87: Salon-Wide Staff Operations Access
- [x] Let approved staff view and edit all salon appointments and workflow entries across groomers and bathers while keeping analytics and other administrator areas restricted

## Phase 88: Approved Staff Continuous Loading Repair
- [x] Diagnose and repair the continuous loading screen blocking approved staff Calendar and Workflow access

## Phase 89: Live Mobile Approved Staff Loading Repair
- [x] Diagnose and repair the confirmed live mobile loading loop for Andy McLucas’s approved staff account

## Phase 90: Independent TV Workflow Display
- [x] Add a separate display-only TV workflow route that can be cast or opened on a TV without changing the desktop or iPad controller view

## Phase 91: TV Display Readability and Hands-Free Viewing
- [x] Add automatic scrolling for appointment lists that exceed one TV screen
- [x] Add a large live digital clock to the TV workflow display
- [x] Apply clear workflow-stage status colours and alternating appointment-row colours on the TV display

## Phase 92: TV Operations Summary and Scrolling Controls
- [x] Add a TV summary of waiting, in-progress and completed dogs for the selected day
- [x] Highlight appointments running past their scheduled time with a gentle visual alert
- [x] Add adjustable TV auto-scroll speed with top and bottom pause behaviour

## Phase 93: TV Display Administrator QR Access
- [x] Add a scannable QR code on the TV display that opens the independent workflow screen on an administrator phone or tablet

## Phase 94: Dedicated TV Session and Synchronisation
- [x] Assess secure dedicated-TV session persistence and confirm the live workflow synchronisation approach

## Phase 95: TV Auto-Scroll Off Control
- [x] Add an explicit Off option to the TV workflow display auto-scroll setting

## Phase 96: Staff Contact Details
- [x] Add confirmed contact emails to Megs, Charlotte and Zakaria’s staff profiles without sending account invitations

## Phase 97: Staff Invitation and Permission Administration
- [x] Add a visible Send Invite action for eligible uninvited staff profiles
- [x] Add an administrator role selector to staff profiles for their operational permission level
- [x] Show clear invited, pending approval and active-account status badges in the staff list

## Phase 98: Adaptive Active TV Workflow Register
- [x] Remove completed dogs from the active TV workflow register while retaining completed counts in the summary
- [x] Increase active appointment-row typography and spacing as fewer dogs remain on the TV display

## Phase 99: TV Completion Experience
- [x] Add a smooth completion fade-out before a dog leaves the active TV register
- [x] Add a temporary completed-dog review toggle for correcting workflow status changes
- [x] Add an engaging all-dogs-complete TV display treatment

## Phase 100: TV Progress and Completion Recovery Controls
- [x] Add daily workflow completion progress to the TV display
- [x] Add a per-dog undo action in the completed review to restore the dog to active workflow
- [x] Add a next-day reset action to the end-of-day TV display

## Phase 101: Nathan Branded Email Assessment
- [x] Confirm whether nathan@barkinbeautiful.com.au can be provisioned through the current Barkin Beautiful mail provider without changing DNS or creating the mailbox

## Phase 102: Nathan Branded Mailbox Provisioning
- [x] Create nathan@barkinbeautiful.com.au through the existing hosting control panel without changing DNS
- [x] Provide verified iPhone IMAP setup settings for Barkin Beautiful mailboxes

## Phase 103: Dry-Stage Workflow Persistence Repair
- [x] Diagnose and repair the database error blocking workflow transitions into the Dry stage

## Phase 104: Staff Invitation Delivery Repair
- [x] Diagnose why invitation emails are shown as sent when recipients do not receive them
- [x] Ensure staff invitation status reflects successful provider acceptance rather than only local invitation preparation

## Phase 105: Shared Family Calendar and Staff Operations
- [x] Render every pet in a shared family appointment rather than only the primary pet, while retaining the single booking and correct combined pricing
- [x] Add a multi-select staff calendar filter so administrators can show any chosen combination of groomers and bathers
- [x] Permit approved staff to edit and delete salon bookings with explicit confirmation and tenant-scoped safeguards
- [x] Add Cancelled and No show as selectable workflow outcomes and ensure terminal appointments do not remain active in workflow views

## Phase 106: Groomigo Multi-Screen Workflow Synchronisation
- [x] Improve workflow-controller and TV-display freshness with autoscale-compatible polling and focused cache updates, without WebSocket or external-service infrastructure

## Phase 107: Terminal Workflow-State Consistency
- [x] Ensure Cancelled and No show appointments are excluded from active controller and TV workflow registers and completion summaries remain accurate

## Phase 108: Client Portal Access Foundation
- [x] Add administrator-issued, expiry-bound client portal access links with no automatic email or SMS delivery
- [x] Provide a restricted client portal view of the linked client’s pets, appointments, memberships and approved grooming-card history

## Phase 109: Client Portal Access Lifecycle
- [x] Show the latest client portal link status and expiry to administrators and allow immediate revocation without automatic messaging

## Phase 111: Staff Appointment Client Search
- [x] Restore approved staff access to tenant-scoped client search in the New Appointment form, including owner name, pet name and phone matching, without exposing the Clients administration area

## Phase 112: Appointment Client Search Feedback
- [x] Distinguish client-search loading, unavailable-service and genuine no-result states in the New Appointment form without changing staff permissions

## Phase 113: Expanded Staff Operations
- [x] Allow approved staff to create salon bookings and manage grooming notes, reports, cards and photos in their operational appointment context
- [x] Preserve administrator-only access to payments, memberships, analytics, staff administration, settings and bulk or client communications

## Phase 114: Inter-Stage Workflow Pause Timing
- [x] Add inter-stage pause or waiting states between active workflow stages so waiting for a table, dryer, groomer or handover is tracked separately and does not inflate Bath, Drying, Grooming or other active-stage timers

## Phase 115: Client-Facing Portal Login Foundation
- [x] Implement a separate client-facing portal login and account setup foundation that remains isolated from staff and administrator access
- [x] Keep client portal setup administrator-controlled and manual-only, with no automatic SMS or email delivery
- [x] Add regression coverage proving client accounts can access only their own portal data and cannot reach staff, calendar, workflow, payment, analytics, settings or administration tools

## Phase 116: Actionable Workflow Timing Review and Staff Analytics
- [x] Make workflow timing review indicators actionable and link them to the relevant staff profile
- [x] Show administrator-only weekly staff timing analytics based on completed, recorded bath, dry, groom and total workflow durations
- [x] Add regression coverage and responsive verification for timing review navigation and weekly averages

## Phase 117: Staff Performance Date Range, Trends and Export
- [x] Add administrator-selectable weekly and custom date ranges to staff timing analytics
- [x] Show daily recorded workflow timing trends for the selected period in a staff profile chart
- [x] Export the selected staff timing analytics and daily trend data as a CSV file
- [x] Add regression coverage and responsive validation for range filtering, trends and CSV output

## Phase 118: Workflow Review Profile Navigation Repair
- [x] Make each Workflow review action open only its selected team member’s profile and timing analytics
- [x] Add regression coverage and validate the corrected selected-profile navigation

## Phase 119: Actionable Workflow Timing Exceptions
- [x] Show the specific recorded stage or total-duration exceptions behind every Workflow review indicator
- [x] Present affected appointment details and a clear administrator review action in the selected staff performance view
- [x] Add regression coverage and validate actionable timing-exception review navigation

## Phase 120: Configurable Timing Review Thresholds and Dashboard Alerts
- [x] Add administrator-configurable tenant review thresholds with preset pet-size and breed overrides
- [x] Apply the most specific configured threshold to Workflow and staff performance timing reviews
- [x] Surface open timing review alerts in the administrator dashboard with direct targeted follow-up navigation
- [x] Add regression coverage and demonstrate the configured review workflow in the interactive prototype

## Phase 121: Exact Staff Activity Audit Timestamps
- [x] Display exact Australian local date and time for every staff access and workflow activity event
- [x] Verify all Workflow stage updates create an attributable, timestamped audit event
- [x] Add regression coverage and validate exact timestamp rendering for staff activity history

## Phase 122: Searchable Staff Activity Audit Log
- [x] Add administrator filters for recorded action type, staff activity search and timeframe
- [x] Add clear chronological sorting and highlight activity that corresponds to a timing review exception
- [x] Export the filtered detailed staff activity history with exact timestamps as CSV
- [x] Add regression coverage and validate the staff activity audit controls

## Phase 123: Bailey Bather Profile and Bather Operations Access
- [x] Add Bailey as an active Bather in the Barkin Beautiful Groomigo tenant
- [x] Ensure approved Bather accounts share groomers’ appointment-detail and workflow-movement access
- [x] Confirm Bather accounts remain excluded from payments, memberships, analytics, settings and staff administration
- [x] Add regression coverage and validate the new bather profile and operational access boundaries

## Phase 124: Automatic Family-Linked Workflow Grouping
- [x] Keep pets from the same family link adjacent in the Workflow at their scheduled appointment time
- [x] Apply family-linked grouping automatically when a family relationship is created or changed, aligning only eligible future shared-family appointment times and preserving completed and historical workflow records
- [x] Add regression coverage and validate deterministic family Workflow ordering

## Phase 125: Family Workflow Visibility and Manual Unlinking
- [x] Add a clear linked-dogs indicator beside family-grouped pets in the Workflow
- [x] Show all linked dog names in an accessible family-group hover detail
- [x] Allow approved staff to unlink a family dog from Workflow without altering booking or workflow history
- [x] Add regression coverage and validate family indicator and unlink controls

## Phase 126: Approved Staff Family Linking
- [x] Allow approved Groomers and Bathers to create family links for pets in their tenant from Workflow
- [x] Preserve tenant-scoped pet validation and block unapproved staff from creating or managing family links
- [x] Add regression coverage and validate Groomer and Bather family-link access boundaries

## Phase 127: Manual Pickup Messaging on Workflow Completion
- [x] Offer an explicit pickup-message action after a dog is marked complete in Workflow
- [x] Let authorised staff select from the client’s saved primary and secondary contacts only
- [x] Require message review and an explicit send action, with no automatic SMS delivery on completion
- [x] Add regression coverage and validate recipient scoping, authorisation and manual-send safeguards
- [x] Add tenant-scoped additional contact storage and profile controls so alternate pickup recipients can be managed safely

## Phase 128: Visual Family Workflow Connector
- [x] Draw an accessible visual connector between adjacent Workflow rows that share an active family group
- [x] Preserve the current link icon, linked-dog hover detail and manual unlink controls
- [x] Add regression coverage and validate the family connector presentation

## Phase 129: Linked Family Workflow Visibility Repair
- [x] Ensure every eligible linked family dog is included in the selected Workflow day and shown with its related row
- [x] Strengthen the continuous family connector so it visibly joins the adjacent linked-dog rows
- [x] Add regression coverage and validate linked-family visibility and connector presentation

## Phase 130: Remembered Family Booking and Timing Trend Repair
- [x] Prompt staff to include saved family-linked companion dogs whenever booking one family member
- [x] Preserve staff selection, capacity rules, price review and one shared appointment session for chosen family companions
- [x] Diagnose and correct daily staff timing trend default ranges and empty-state guidance using recorded completed workflow data
- [x] Add regression coverage and validate remembered family booking and administrator timing trend behaviour

## Phase 131: Staff Timing Analytics Duration Repair
- [x] Calculate staff stage and total timing averages from persisted millisecond workflow timestamps
- [x] Populate daily timing trend bars and summary values whenever completed duration records exist
- [x] Add regression coverage and verify the repaired administrator trend with recorded Groomigo data

## Phase 132: Bracket-Style Family Workflow Marker
- [x] Replace the Workflow family connector with a prominent bracket-style marker beside adjacent linked dogs
- [x] Retain existing family link icon, hover names and manage/unlink controls without affecting timing columns
- [x] Add regression coverage and validate the revised family linkage presentation

## Phase 133: Responsive Full-Viewport Appointments Calendar
- [x] Make the Appointments day view fill the available desktop and tablet viewport beneath the toolbar and staff headers
- [x] Keep calendar scrolling constrained to the schedule grid, retaining horizontal staff access on narrower screens
- [x] Add responsive regression coverage and validate the calendar without unnecessary page scrolling

## Phase 134: Rui and Evie Shared Appointment Reconciliation
- [x] Reconcile Rui and Evie Bates’ selected-day records into one shared appointment session and calendar card
- [x] Preserve appointment time, service, staff assignment, price and workflow history while removing the duplicate calendar presentation
- [x] Verify the shared appointment display and record the safe correction

## Phase 135: Membership-Aware Appointment Creation
- [x] Show a clear active membership sticker for the selected client and pets in appointment creation
- [x] Set appointment price to $0 only when all selected pets are covered by an active weekly membership, while retaining membership linkage
- [x] Confirm remembered family groups of two or more pets can be selected into a shared new appointment
- [x] Add regression coverage and validate membership and multi-dog appointment safeguards

## Phase 136: Immediate Client Membership Trigger Repair
- [x] Show an active membership indicator as soon as a client is selected, before pets are selected
- [x] Retain the selected-pet and service coverage detail that determines protected $0 appointment pricing
- [x] Add regression coverage and validate the immediate membership indicator in New Appointment

## Phase 137: Controlled Membership Package Selection
- [x] Extract final weight-specific membership packages, weekly prices and appointment frequencies from the supplied schedule
- [x] Replace free-text membership naming with an eligible package dropdown based on the selected pet’s recorded weight class
- [x] Auto-fill verified weekly price, weekly billing cadence and tier appointment frequency, retaining administrator-only control
- [x] Add regression coverage, validate the controlled membership creation flow and reconcile any existing configuration differences

## Phase 138: Pet Weight Capture and Unknown-Weight Membership Selection
- [x] Add a controlled recorded dog-weight option to client pet profiles for membership eligibility
- [x] When the weight is unknown, provide an administrator/approved-staff tier-first and weight-band-second package selector
- [x] Continue to derive membership name, weekly price, billing cadence and appointment frequency from the verified package schedule
- [x] Add regression coverage and validate known-weight and unknown-weight membership selection paths

## Phase 139: Cancelled Appointment Calendar Visibility
- [x] Keep cancelled appointments in their originally scheduled calendar time slot for historical tracking
- [x] Add a prominent CANCELLED treatment and struck-through dog name to cancelled calendar cards
- [x] Add regression coverage and validate cancelled appointment placement and presentation

## Phase 140: Shared Appointment Pet-First Naming
- [x] Show every dog name before the household surname on shared multi-dog calendar cards
- [x] Match the pet-first shared booking name in hover detail and accessible labels
- [x] Add regression coverage and validate shared appointment naming across calendar views

## Phase 141: Mobile Client Search Scrolling
- [x] Make New Appointment client-search results independently scrollable on mobile devices
- [x] Retain touch selection and the appointment form’s mobile layout while browsing results
- [x] Add regression coverage and validate the mobile client-search overflow behaviour

## Phase 142: Shared Booking Labels and Search Reset
- [x] Confirm every shared appointment surface shows all dog names before the household surname
- [x] Add an accessible clear button to reset New Appointment customer searches on mobile
- [x] Add regression coverage and validate shared labels and search clearing

## Phase 143: Workflow Bathing Priority Queue
- [x] Add a tenant-scoped, persisted 1–5 bathing priority to active Workflow appointments
- [x] Apply a selected bathing priority to all same-session or linked family dogs that need coordinated bathing
- [x] Present a clear editable bathing queue without moving appointment times or workflow stages
- [x] Add regression coverage and validate priority bounds, tenant access and linked-dog behaviour

## Phase 144: All-Stage Bathing Priority Control
- [x] Allow approved users to set or clear bathing priority at every non-terminal workflow stage
- [x] Keep the Bath queue limited to dogs that still need bathing, without changing stored priorities later in the process
- [x] Add regression coverage and validate all-stage priority controls and active queue filtering

## Phase 145: Enhanced Workflow Bath Queue
- [x] Add touch-friendly drag-and-drop reordering that rewrites the controlled bath priorities without moving appointments or stages
- [x] Add a staff-accessible coordinated-bathing action so selected dogs can share one bath priority
- [x] Colour-code priority values 1–5 consistently in the Workflow controller and read-only display
- [x] Add regression coverage and validate queue order, linked groups, priority bounds and presentation
