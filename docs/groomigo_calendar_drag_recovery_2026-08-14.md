# Calendar Drag-and-Drop Recovery — 14 August 2026

Link McLucas’s appointment was recovered after a cross-groomer drag operation. The appointment record remained in the database and has been restored to **Tuesday 18 August 2026, 2:00pm–4:00pm**, assigned to **Charlotte Purcell**, with its pending workflow state preserved.

The defect arose because the calendar drag handler converted an AEST appointment timestamp into a browser-local datetime string before sending it to the server. The drag pathway now builds the AEST day and time as a canonical UTC instant and persists its ISO timestamp directly. This avoids browser-timezone reinterpretation that could shift an appointment into an unexpected visible slot after reassignment.

Regression tests cover a 2:00pm AEST cross-groomer move and duration preservation. The full test suite has **56 passing tests** and TypeScript validation passes.
