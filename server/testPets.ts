import { sql } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";

/**
 * Keeping a test dog out of the salon's figures.
 *
 * `memberships.isTest` has done this for revenue since 0051. `pets.isTest`
 * does it for everything a dog touches, and it is a subquery rather than a
 * join because none of the analytics queries join `pets` — they read
 * `appointments` directly, and adding a join to each of them to carry one
 * boolean would be a larger change with more ways to go wrong.
 *
 * `tenantId` is REQUIRED, and that is the point of the parameter rather
 * than a default. Without it the subquery reads every salon's pets: at one
 * tenant that is free, at fifty it is a scan whose cost grows with the
 * PLATFORM instead of with the salon asking the question. It also leans on
 * `idx_pets_tenant`, which the unscoped version could not use.
 *
 * Making it required means the compiler asks for it at any new call site,
 * rather than the next person having to remember. That is the same reason
 * the MoeGo alias map moved to one copy with a test behind it.
 *
 * Correctness is unchanged by the scoping: `appointments.pet_id` always
 * points at a pet in the same tenant, so restricting the subquery to that
 * tenant removes rows that could never have matched.
 *
 * Deliberately NOT applied to the calendar or the workflow board. The whole
 * point of a test dog is being able to see him while testing; what must not
 * happen is his fixture grooms counting as somebody's work, or an inference
 * script reading them as evidence about a real customer.
 */
export function excludeTestPets(petIdColumn: AnyMySqlColumn, tenantId: number) {
  return sql`${petIdColumn} NOT IN (SELECT id FROM pets WHERE tenant_id = ${tenantId} AND is_test = TRUE)`;
}
