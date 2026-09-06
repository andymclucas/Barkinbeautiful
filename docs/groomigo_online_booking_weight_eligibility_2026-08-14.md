# Online Booking Pet-Weight Eligibility QA — 14 August 2026

Groomigo’s online booking logic now uses the following confirmed pet-weight bands: Small 0–10kg, Small–Medium 11–13kg, Medium 14–16kg, Large 17–25kg, Extra Large 26–35kg and Giant 36–80kg.

When online booking is released for a groomer, the booking form requires a dog weight before the service selector is enabled. The available service labels display the selected dog-size band, for example `Classic Groom · Extra Large · 26–35kg`. The public guest booking procedure stores the entered pet weight, adds the size band to the appointment notes, and rejects any missing, unsupported or out-of-range weight before it creates the booking. Existing-pet online bookings apply the same validation against the saved pet weight.

The public booking page remains deliberately closed because no staff profile has been released for online booking. This is the expected prototype state. The complete automated suite has 41 passing tests, including weight-band boundary coverage from 0kg through 80kg, and TypeScript validation passes.
