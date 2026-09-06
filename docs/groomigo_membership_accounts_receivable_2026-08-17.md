# Groomigo Membership Accounts Receivable

## Purpose and scope

The Accounts Receivable tab corrects the limitation of treating member appointments as $0 invoices. A member appointment can remain $0 at point of service because the membership covers the booking, while Groomigo separately records the **delivered groom value** used for membership reconciliation.

The workflow is prototype-safe. It creates **draft invoices only** and neither sends them to a client nor collects a payment automatically.

## Calculation basis

| Metric | Calculation |
|---|---|
| Paid to date | Paid membership-payment rows plus verified payment entries in the membership ledger. |
| Groom value delivered | Positive completed-appointment prices plus recorded delivered-groom ledger values. |
| Arrears | `max(0, groom value delivered − paid to date)`. |
| Credit | `max(0, paid to date − groom value delivered)`. |

Completed member appointments with a zero or missing price are classified as **unvalued**, not as free. Staff must record the delivered value before a final arrears invoice can be prepared. This protects the salon from invoicing an amount that lacks a confirmed underlying groom value.

## Staff workflow

1. Open **Memberships → Accounts Receivable**.
2. Use **Record payment** to enter a verified historical payment, selecting whether it was manually verified, imported from MoeGo, or verified in Stripe. This action does not charge the client.
3. Use **Value groom** for any completed $0 membership appointment. The value is retained in the append-only membership ledger.
4. Review paid-to-date, delivered value, arrears and the account status. A first failure is shown as **grace period**; two failures or a booking suspension are **declined**; cancelled or expired memberships remain visible as **cancelled**.
5. If the calculation is complete, use **Draft invoice**. Groomigo creates a reviewable invoice linked to the membership and does not send it.
6. Apply **Place hold** when staff must review payment before accepting a further booking. Releasing the hold is an explicit administrative action.

## Safeguards

The reconciliation only includes completed appointments for the same client and pet from the membership start date. It blocks duplicate delivered-value entries for one appointment and blocks a second open arrears invoice for the same membership. All ledger records retain their source, amount, timestamp and staff user.
