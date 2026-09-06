# Online Booking Form Alignment QA — 14 August 2026

The booking preview’s top controls were changed from an inflexible three-column grid to a two-column layout. Dog weight and service now share the first row, with the requested date and time control occupying its own full-width row below. The service trigger is explicitly width-constrained within a `min-w-0` column, preventing a long size-band label from intruding into the date field.

An authenticated preview check using a 43kg dog showed the `Classic Groom · Giant · 36–80kg` selection in the service control while the requested date and time field remained on a separate aligned row. The same layout contracts are covered by a focused unit test; all 45 tests and TypeScript validation pass.
