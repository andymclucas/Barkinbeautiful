# Groomigo Departed-Pet Membership Management

## Purpose

This administrator-only workflow lets the salon respectfully preserve a departed pet’s complete history while resolving any active membership without deleting care, appointment, payment or grooming-report records.

## Workflow

| Step | Administrator action | Result |
|---|---|---|
| 1 | Select **Record passing** on the pet card and optionally add a private note. | The pet is marked **Passed away** and remains visible in the client history. |
| 2 | Open **Manage** beside an active membership on that departed pet. | The administrator chooses to transfer or remove the membership. |
| 3A | Select an active replacement pet in the same configured weight band. | The membership is reassigned without changing its payment history, tier or billing details. |
| 3B | Select **Remove membership**. | Future billing is stopped, the membership becomes cancelled, and the record remains historical. |

## Safeguards

The workflow is restricted to administrators. A membership cannot be handled until the pet has been recorded as departed. Replacement candidates must belong to the same client, be active, have a stored valid weight, and fall in the same configured band as the departed pet: Small (0–10kg), Small–Medium (11–13kg), Medium (14–16kg), Large (17–25kg), Extra Large (26–35kg), or Giant (36–80kg).

Every passing, membership removal and transfer creates a timestamped client-profile audit entry showing the action, relevant pets, membership and administrator. Departed pets are excluded from new appointment selection.

## Validation

The shared eligibility checks cover allowed same-band replacements and reject adjacent-band, departed, identical and unweighed replacements. The full project suite passes with 63 tests and TypeScript compilation clean.
