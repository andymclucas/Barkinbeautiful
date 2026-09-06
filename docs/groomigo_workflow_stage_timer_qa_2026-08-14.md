# Groomigo Live Workflow Stage Timer QA — 14 August 2026

Every active operational workflow stage now displays a live elapsed-time tracker directly inside its stage chip. For example, a pet in **Bath** displays `BATH · 5:38`, with the elapsed counter updating every second. Waiting, completed and terminal states intentionally do not run a stage timer.

The persisted `stageStartedAt` value is the active timer source. On every transition, the workflow timing helper assigns a new `stageStartedAt` for the entered stage and stops the departed Bath, Dry or Groom stage by recording its completion timestamp. Direct drag-and-drop skips are also covered: leaving Bath directly for Groom now records Bath completion before Groom begins.

An authenticated Workflow Board check confirmed the active **IN** chip displays its elapsed timer directly beside the stage wording. The complete test suite has **38 passing tests** and TypeScript validation passes. Existing total-time and daily production timing metrics remain available.
