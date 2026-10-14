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
 * The subquery is cheap: there is one test dog, and the planner reads the
 * list once rather than per row.
 *
 * Deliberately NOT applied to the calendar or the workflow board. The whole
 * point of a test dog is being able to see him while testing; what must not
 * happen is his fixture grooms counting as somebody's work, or an inference
 * script reading them as evidence about a real customer.
 */
export function excludeTestPets(petIdColumn: AnyMySqlColumn) {
  return sql`${petIdColumn} NOT IN (SELECT id FROM pets WHERE is_test = TRUE)`;
}
