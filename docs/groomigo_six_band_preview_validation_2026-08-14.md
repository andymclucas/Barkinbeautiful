# Groomigo Online Booking Preview Validation — 14 August 2026

## Scope

Six controlled booking requests were submitted through the protected administrator preview route. Each request used the real protected backend path, was labelled as a preview test, and was created as a pending appointment only. No client messages or automatic confirmations were sent.

| Weight | Expected size band | Assigned preview groomer | Local slot on 7 September 2026 | Appointment ID | Result |
|---:|---|---|---|---:|---|
| 10kg | Small | Megs | 8:00 am | 240004 | Created as a pending, marked preview booking |
| 11kg | Small-Medium | Megs | 10:00 am | 240005 | Created as a pending, marked preview booking |
| 14kg | Medium | Megs | 12:00 pm | 240006 | Created as a pending, marked preview booking |
| 17kg | Large | Ashleigh | 8:00 am | 240007 | Created as a pending, marked preview booking |
| 26kg | Extra Large | Brooklyn | 8:00 am | 240008 | Created as a pending, marked preview booking |
| 36kg | Giant | Charlotte | 9:00 am | 240009 | Created as a pending, marked preview booking |

The protected capacity checks returned real available slots for each request. Each record contains the preview safety marker and its matching size-band note. A follow-up database check confirmed that the six records are `pending` and `scheduled`; a separate SMS-log check returned **0** matching messages.

## Automated regression coverage

The focused automated suite verifies that the Small, Small-Medium, Medium, Large, Extra Large and Giant boundaries map to the correct eligible service label and retain the protected preview marker. The focused run completed with six passing tests across the preview and weight-eligibility suites.

## Prototype safeguards retained

These test bookings are deliberately labelled as automated preview records and should be treated as test data. They do not release public booking, do not confirm appointments automatically and do not trigger client communications.
