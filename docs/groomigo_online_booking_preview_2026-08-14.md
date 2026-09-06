# Groomigo Online Booking Preview — 14 August 2026

## Preview access

The interactive preview is available to an authenticated Groomigo administrator at:

`/book/preview`

It is intentionally protected. The normal customer URL, `/book`, remains a **Coming soon** page because tenant-wide `onlineBookingEnabled` remains `false`.

## Safe preview configuration

Megs Graham is configured as the current preview-only groomer. Her profile supports Classic Groom, Styled Groom, Bath Only, De-shed, Nail Trim and Other, with one dog per time slot and a six-dog daily preview capacity. This staff-level setup is not exposed on the public booking route while tenant-wide online booking remains disabled.

The preview visibly states that every request is a test. Its routes require administrator authentication, bypass the global public-release guard only for preview actions, and tag created appointments with:

`[PREVIEW TEST — no client messaging or automatic confirmation]`

The platform does not send email or SMS from this pathway. Test requests are created as `pending` appointments for normal administrative review.

## Size-band testing

The preview starts with no selected service until a valid 0–80kg dog weight is supplied. The interface and server enforce: Small 0–10kg; Small–Medium 11–13kg; Medium 14–16kg; Large 17–25kg; Extra Large 26–35kg; Giant 36–80kg. A 35kg preview check correctly rendered `Classic Groom · Extra Large · 26–35kg`.

The public route was rechecked after normalising the tenant flag returned by MySQL. It now correctly renders only **Online booking is coming soon** and does not expose the preview-only groomer. The authenticated `/book/preview` route continues to display its explicit no-message, no-live-release notice; its groomer query was observed loading after the route check.

Run administrator-led test bookings across the remaining band boundaries before enabling tenant-wide live booking. The test suite has 43 passing tests and TypeScript validation passes.

## Expanded groomer preview picker

The protected preview now includes every active groomer: Ashleigh, Brooklyn, Charlotte, Megs and Zakaria. The customer-facing cards intentionally show first names only. All five are configured for preview-safe online selection with one dog per slot, six preview dogs per day and the same supported grooming services. Tenant-wide public booking remains disabled.
