# Client Quick Preview QA — 13 August 2026

The authenticated Groomigo Clients page was checked with the first client entry. Hovering the client name now opens the quick preview directly beside the name, rather than at the far edge of the client table. The preview shows the full client name, telephone number, email address, pets and recent appointments, with the existing client-detail link preserved.

The positioning logic opens the preview on the right when enough horizontal space exists and selects the left side when a right-aligned card would exceed the viewport. Radix collision handling supplies the remaining viewport protection for small screens and vertical boundaries.
