/**
 * The agreements, as Lauren wrote them in MoeGo.
 *
 * Read out of MoeGo verbatim on 3 October 2026 rather than retyped: these
 * are the words clients have already signed, and a paraphrase would be a
 * different agreement. Treat edits here as a legal change, not a copy
 * tweak — and bump the document version rather than editing in place once
 * anyone has signed.
 *
 * The five VIP agreements are identical apart from the title, the TIER
 * line, the inclusions and the tier named in the declaration, so the
 * shared body is a template and each tier supplies only its own parts.
 */

export type SeedAgreement = {
  slug: string;
  title: string;
  body: string;
  /** MoeGo's own setting, carried across so nothing changes by accident. */
  requirement: "sign_once" | "every_booking" | "manual";
};

const BUSINESS_HEADER = `BUSINESS DETAILS: The Trustee for Lauren Romari Family Trust trading as Barkin Beautiful

ABN: 50 517 623 260 | Address: Shop 2/11 Dan Street, Capalaba, QLD 4157 | Phone: 07 3823 4567Email: info@barkinbeautiful.com.au`;

const MEMBERSHIP_TERMS = `TERMS AND CONDITIONS:

1. Minimum Term: This agreement is for a minimum term of 12 months from the commencement date.

2. Payment: Payments will be debited weekly via your selected payment method (Direct Debit or Credit Card).

3. Notice Period: A written notice of 30 days is required for any changes or cancellations to this membership after the minimum term has expired.

4. Price-Lock Guarantee: The weekly membership rate is locked in for a period of 2 years from the commencement date of the membership. After this period, rates may be subject to review and adjustment, with written notice provided prior to any change taking effect.

5. Failed Payments: In the event of a failed payment, the customer is responsible for any associated bank fees and must arrange alternative payment promptly.

6. Additional Services: Any services requested on the day that are not included in the membership package (for example, additional treatments, specialty add-ons, or services outside the scheduled visit type) are not covered by the weekly membership rate and will be payable in full on the day of the appointment.

7. Weight Category Changes: The weekly membership rate is based on the dog's weight at the time of sign-up. If the dog's weight increases and moves into a higher weight category (for example, as a puppy grows), the weekly debit amount will be adjusted to reflect the applicable rate for the new weight category. Barkin Beautiful will provide written notice of any such price change prior to the adjustment taking effect.

8. Groomer Availability: Memberships are entered into with Barkin Beautiful and not with any individual groomer. While we will always do our best to accommodate requests for a preferred groomer, Barkin Beautiful cannot guarantee the ongoing availability of any specific staff member. In the event a groomer is unavailable or ceases employment with Barkin Beautiful, grooming services will continue to be provided by another qualified team member. This does not constitute grounds for cancellation, refund, or early termination of the membership agreement.`;

function membershipBody(tierLabel: string, inclusions: string): string {
  const upper = tierLabel.toUpperCase();
  return `BARKIN BEAUTIFUL - ${upper} VIP MEMBERSHIP AGREEMENT

${BUSINESS_HEADER}

TIER: ${tierLabel} VIP Membership

TERM: 12-Month Minimum Term

DEBIT FREQUENCY: Weekly

VIP INCLUSIONS:${inclusions}

${MEMBERSHIP_TERMS}

DECLARATION: By signing this digital agreement, I acknowledge that I have read and understood the terms and conditions of the ${tierLabel} VIP Membership. I authorise The Trustee for Lauren Romari Family Trust trading as Barkin Beautiful to debit my nominated account or credit card for the weekly amount corresponding to my dog's weight category and selected haircut type as listed above.`;
}

/** Verbatim from MoeGo, run-together punctuation and all. */
const TIER_INCLUSIONS: Record<string, string> = {
  diamond: "- Full haircut every 6 weeks (Classic or Styled)- Fortnightly bath. Flexible Service Swaps — up to 10 times per year- Priority booking for all appointments- 15% off selected retail products in-store- 15% off selected playgroup items",
  platinum: "- Full haircut every 6 weeks (Classic or Styled)- Tidy-up (face, feet & hygiene every 3 weeks. Flexible Service Swaps — up to 8 times per year- Priority booking for all appointments- 15% off selected retail products in-store- 15% off selected playgroup items",
  gold: "- Full haircut every 8 weeks (Classic or Styled)- Flexible Service Swaps — up to 6 times per year- Priority booking for all appointments- 10% off selected retail products in-store- 10% off selected playgroup items.",
  silver: "- Full haircut every 6 weeks (Classic or Styled)- Flexible Service Swaps — up to 3 times per year- Priority booking for all appointments- 10% off selected retail products in-store- 10% off selected playgroup items",
  bronze: "- Full haircut every 8 weeks (Classic or Styled)- Flexible Service Swaps — up to 2 times per year- Priority booking for all appointments- 5% off selected retail products in-store- 5% off selected playgroup items",
};

const TIER_LABELS: Record<string, string> = {
  diamond: "Diamond", platinum: "Platinum", gold: "Gold", silver: "Silver", bronze: "Bronze",
};

export const MEMBERSHIP_AGREEMENT_SLUGS = ["diamond", "platinum", "gold", "silver", "bronze"] as const;

export const SEED_AGREEMENTS: SeedAgreement[] = [
  ...MEMBERSHIP_AGREEMENT_SLUGS.map((tier) => ({
    slug: `membership-${tier}`,
    title: `${TIER_LABELS[tier]} VIP Agreement`,
    body: membershipBody(TIER_LABELS[tier], TIER_INCLUSIONS[tier]),
    requirement: "manual" as const,
  })),
  {
    slug: "service-agreement",
    title: "Barkin Beautiful Service Agreement",
    requirement: "sign_once",
    body: `Pets are accepted for grooming only under the following circumstances.

The pet is fit and healthy, Grooming which takes place on an elderly or infirm pet will be at the owner's risk.
The pet's vaccines are up to date unless otherwise discussed.
Payment is to be made at the time of service. Payment can be cash debit or credit card. Our rates are based on size, condition of coat, behavior and the breed of the pet and duration of the groom. Nail cutting and ear cleaning are part of the service unless the process is too stressful for the pet or too dangerous for the groomer.
“De-matting" or complete coat removal will dramatically alter your pet's appearance, It can cause irritation and or sometimes injury. We reserve the right to shave if it's for the benefit and comfort of the pet.

Accidents with grooming Sessions

In the event of an emergency, in your absence, you authorise us to contact the nearest Veterinarian
 Vet to treat the pet as necessary at your expense if in not direct injury from our grooming session, excluding matted or difficult pet's causing injury will be the owner's expense.
If the injury occurs in a grooming session we will contact the client and take the dog to the closest vet available for treatment with vet costs covered by the groomer.
If the injury is minor we will notify the client on precautions and if they would like to seek veterinary treatment with in 48 hours of grooming. Outside the 48hours of the incident the salon will not be held accountable for infections costs for veterinary treatment. All receipts from clinics to be emailed to info@barkinbeautiful.com.au

Daycare/ Early drop off / Late pick up

If you need your pet to come earlier than your scheduled time (more than 1 hour) or need to stay over the 4hour maximum grooming session a $10 per hour per pet will be added to your service- for example: Appointment time is 8am & your pet is finished at 10am but you are unable to come back until 3pm - 3 hours of daycare will be added ($30). Customers will not be charged if the groomer is running behind due to unforeseen circumstances
Late pick up. If you are unable to come back before we close 5pm, an after-hours fee of $50 per 10 min will be charged.

Appointment times

We recommend all clients to be on a schedule of pre booked appointments up to 8 weeks.
The salon runs on a tight schedule and its extremely important to be on time. If you are running late, please call the salon directly with notice. If you are late, it will put pressure on the rest of our day and schedule making us run behind on other clients.
If you are more then 45min late without notice to your scheduled booking - it will be considered a no show and charges will apply, and your appointment maybe cancelled.
Saturday bookings - Limited appointment only Saturday bookings maybe available but at a $30 surcharge to cover weekend rates for the groomers working on weekends. Note : Not all weekday groomers will be working a weekend roster & appointments are subject to availability.
Pet’s collars, leads & harnesses are to be removed and taken with the client at drop off to avoid items being lost or damaged. When the customer returns for collection we can help put belongings back on for a safe departure.
All pets must have a lead on when entering the salon to avoid running away.

Ultrasonic Teeth Cleaning Disclaimer

Our ultrasonic teeth cleaning and brushing service is a cosmetic grooming procedure, not a substitute for professional veterinary dental care. We use pet-safe tools to remove surface-level plaque and freshen breath, but we do not go below the gumline or treat dental disease. Dogs showing signs of discomfort or dental issues will be referred to a vet. By proceeding, you acknowledge these limitations and release Barkin Beautiful Grooming Studio from liability for any complications that may arise during or after the service.

Anal Glands

Our salon only does external anal gland expressions. If the dog is showing signs that they need to be expressed it will automatically be added on to the clients grooming package as the process needs to be done before the dog has its bath. If the pet is uncomfortable with having the procedure done, the groomer will stop and refer you to a vet to complete.

 Cancellations

We try to work as long as conditions are not dangerous. If you are unsure, please call us to confirm.

Cancellation and rescheduling of an appointment, by the client, requires 24 hours' notice to waive the FULL appointment fee.
In the event of in climate weather, a family emergency or any other uncontrollable circumstance, the groomer has the discretion to waive the fee within the 24-hour period.
We reserve the right to cancel or reschedule a groom if we feel the need to do so. Every effort will be made to reschedule at a time convenient for both the client and the groomer.

2. No-Shows

It is considered a "no-show" when the client is not available at the scheduled appointment time and does not contact the groomer to cancel or reschedule.

We reserve the right to charge the FULL grooming fee due to the loss of revenue caused by a "no-show". Please make every effort to call and cancel or reschedule when possible to avoid such situations.
We reserve the right to refuse service to any pet or client for any reason.`,
  },
];
