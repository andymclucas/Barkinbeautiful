/**
 * What the support assistant knows about Groomigo.
 *
 * Hand-written, and deliberately only what is true of the screens today.
 * The assistant is told to say so when something is not in here rather
 * than guess a menu path, so a gap in this file produces "I'm not sure,
 * shall I get a person?" instead of a confident wrong answer.
 *
 * KEEP IT CURRENT. When a screen changes in a way staff would ask about,
 * change the paragraph here in the same commit.
 */
export const SUPPORT_KNOWLEDGE = `
# Getting around
- The sidebar on the left has: Appointments (the calendar/diary), Workflow Board, Clients & Pets, Counter Sale, Memberships, Pricing & Services, Messages (texts), Portal Messages (chat from clients' portal), Email Campaigns, Analytics, Reporting and Staff. Some of these are grouped under Financials, Communication and Insights. A staff member only sees the sections their login has been given.
- The Search box at the top (or Cmd/Ctrl+K) finds clients, dogs and bookings. Clicking into an empty search box shows the last five things you opened from search.
- "Report a problem" is the speech-bubble-with-warning icon in the top bar (on a phone it is in the account menu, top right). It sends the owners a report with a screenshot of the screen you are on. Use it for anything that looks broken.
- The bell in the top bar shows notifications. The moon switches light and dark.

# Appointments (the calendar)
- Click a booking to open "Edit appointment". Change what you need, then press Save Changes at the bottom. Nothing is saved until you do.
- Status is at the top of that window. It shows where the dog is: Scheduled, Checked In, Waiting for Bath, Bathing, Waiting for Dry, Drying, Waiting for Groom, Grooming, Ready, Complete, or Cancelled / No show. Pick a status, then Save Changes.
- On a family booking (more than one dog) the Status at the top is for the first dog only, and it says which dog. The other dogs are handled in "Dogs on this booking" further down the same window.
- One dog on a family booking isn't coming: open the booking, scroll to "Dogs on this booking", press "Not coming" beside that dog, and confirm. The other dogs stay booked at the same time. "Put back on" undoes it. This works for a dog that is still Scheduled or only Checked In. Once a dog is in the bath or further along, the button is replaced by "At the salon".
- "Cancel the whole booking" in the same section cancels every dog still to come, and the client gets one text.
- Cancelling through the app sends the client the usual cancellation text if the booking's start time has not passed yet.
- "Must go home by" sets a pick-up deadline for the dog. "Apply discount" and the per-dog prices are just under the status. "Take payment" is at the bottom.
- "Add family dogs" in the booking window adds another of the client's dogs to the same booking.
- Dragging a booking to another time on the same day does not text the client. Moving it to another day does.
- The time on the diary is when the groom starts, not when the client drops off.
- A small "MoeGo" badge on a booking or price means it was imported from MoeGo. Imported prices are kept as they were; new bookings use Groomigo's price list.
- A cancelled booking keeps its original slot and cannot be dragged.

# Workflow Board
- Shows today's dogs in columns by stage. Move a dog on as it goes through bath, dry and groom.
- When a dog is marked Ready, a "Send ready-for-pickup message" window opens. Check who it is going to and press Send; the text is not sent until you do.

# Clients & Pets
- A client's page has tabs: Overview, Pets, Bookings, Memberships, Payments, Agreements, Packages, Vaccinations, Reviews and History. Send SMS, Edit details and Preferences are under the client's name.
- Bookings has Upcoming, History, Cancelled and No-show. Clicking a booking date opens that booking on the calendar.
- "View client portal" shows what the client sees, without changing anything.
- A dog that has died: the owner or an admin records it with "Record passing" on the dog. That keeps the dog's history, and cancels the dog's future bookings without texting the client. If there is a membership, a prompt asks what to do with it.
- A dog that is simply no longer a client's (rehomed, duplicate): use Archive on the dog, not Record passing. Archive is refused while the dog has upcoming bookings or a membership, and says why.

# Memberships
- A membership groom has no price on the booking: the weekly payment covers it. Extras done on the day are charged separately.
- New membership sign-ups from the website arrive as requests that staff approve first; nothing is charged or booked until then.

# Counter Sale
- Any staff login can ring up a product sale at the counter. A sale can only be voided on the day it was made.

# Texts to clients
- Texts the system sends on its own are limited to a short approved list (for example the reply to a missed call). Anything else is sent by a person pressing send.
- Messages shows the text conversation with each client.

# Client portal
- Clients sign in at clients.barkinbeautiful.com.au. They can ask for a sign-in link or a 6-digit code by email, and stay signed in for a year.

# Phone notifications
- Switch them on in Settings. On an iPhone or iPad they only work once Groomigo has been added to the Home Screen (Share, then Add to Home Screen) and opened from there.

# Logins
- A restricted staff login sees only its own appointments and the workflow. If a section is missing from the sidebar, the salon owner can grant it from Staff.
- Forgotten password: use "Forgot password" on the sign-in screen.
`.trim();
