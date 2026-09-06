# Calendly-Style Online Booking Slot Picker QA — 14 August 2026

The protected Groomigo booking preview no longer exposes a free-form requested time field. Customers now choose a groomer, enter the dog’s weight, select an eligible service and choose a date. The server returns only valid 30-minute booking starts between 8:00am and 5:00pm AEST that allow the selected service to finish before closing.

The slot list uses the same capacity validator as final request creation. It respects the selected groomer’s service list, per-slot capacity, daily capacity, lead-time rule, existing confirmed or pending appointments, daily bath-only limit and shared bathing capacity. Final creation repeats the capacity check, so a stale slot cannot be submitted as a booking.

Authenticated preview evidence confirmed that Megs, a 43kg Giant dog and Classic Groom on 17 August 2026 produce server-filtered choices from 8:00am through 3:00pm. Selecting 9:00am displayed the chosen date and time in the form; no arbitrary time entry was possible. The preview remains administrator-only, public `/book` remains unreleased and no messaging is sent. The suite has 48 passing tests and TypeScript validation passes.
