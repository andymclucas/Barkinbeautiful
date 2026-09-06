# Groomigo Day Calendar Column Width QA — 14 August 2026

The Groomigo day calendar now assigns every staff member a fixed **320px** track, rather than compressing all staff columns to the available screen width. The time gutter remains aligned at 52px and the full staff grid uses intentional horizontal scrolling, allowing the user to pan through groomers and the bathing team without reducing the readable width of appointment cards.

The authenticated day-calendar check confirmed that normal appointment cards now display pet and client names, appointment time, service type and next-appointment context with substantially more room. Existing drag-and-drop column targets, time-grid alignment, role-group headers and staff ordering remain unchanged. A focused grid-sizing test covers the fixed-width tracks and unassigned fallback; the complete test suite has 34 passing tests and TypeScript validation passes.

The final rendered check identified that the first fixed-width implementation could flex-shrink inside its horizontal wrapper. The grid is now explicitly non-shrinking, so only the first readable staff tracks are visible at once and the remaining groomer and bathing-team tracks are reached by horizontal scrolling, as intended.
