# Large-Dog Online Booking Capacity QA — 14 August 2026

Groomigo now protects the online booking schedule for **Large (17–25kg), Extra Large (26–35kg) and Giant (36–80kg)** dogs when the service is a Classic Groom or Styled Groom.

The rule is applied in two layers. A groomer can receive at most one qualifying large-dog full groom in the AEST morning and one in the AEST afternoon. Across the whole salon, the online booking system will not offer or accept a fourth qualifying large-dog full groom on the same AEST day, even if another groomer has capacity. Bath-only, de-shed, nail trim and dogs below 17kg are unaffected by these specific limits.

The same capacity calculation runs when available times are generated and again immediately before booking creation, preventing a stale or manually altered slot from bypassing the guard. Unit coverage confirms the 17kg threshold, each-groomer half-day restriction and salon-wide third-booking ceiling. The complete suite has **54 passing tests** and TypeScript validation passes.
