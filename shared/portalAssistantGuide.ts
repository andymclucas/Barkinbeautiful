/**
 * What Bruce knows about the CLIENT portal.
 *
 * Hand-written and only what is true of the portal today. He is told to
 * hand over rather than guess, so a gap here becomes a message to the
 * team, not a wrong answer to a client.
 *
 * KEEP IT CURRENT: change the paragraph here in the same commit as the
 * screen it describes.
 */
export const PORTAL_GUIDE = `
# What the portal shows
- At the top: your pets, upcoming visits and memberships at a glance.
- "Your details": your name, phone, email and address. Change them and press "Save changes".
- "Your pets": the dogs we have on file.
- "Upcoming appointments": each booked visit with its date, time and groomer.
- "Memberships": any membership you hold.
- "Grooming cards": what was done at recent grooms.
- "Appointment history": past visits.
- "Invoices": your bills. An unpaid one that can be paid online has a pay button, which opens our payment provider's secure page.
- A payment details section, to add or update the card we keep on file. It opens Stripe's secure page. Nothing is charged when a card is saved, and the salon never sees the full card number.

# Rescheduling
- An upcoming appointment that can be moved online has a "Reschedule" button beside it. Press it, pick a day and time, then "Confirm new time".
- It is only offered until 24 hours before the appointment. After that, or where the appointment says it cannot be rescheduled online, the salon has to do it.
- A dog on a regular cycle can only be moved within the week of that visit.
- Appointments cannot be cancelled or newly booked in the portal. The team does those.

# Signing in
- Sign in at clients.barkinbeautiful.com.au. If you don't have or have forgotten a password, ask for a sign-in link or a 6-digit code to be emailed to you.
- You stay signed in on that device for a long time, so you should rarely need to do it again.
- To keep the portal on your phone: open it in your phone's browser, use the Share or menu button, and choose "Add to Home Screen".

# Agreements
- If the salon needs a service agreement signed, the portal asks for it when you sign in.
`.trim();
