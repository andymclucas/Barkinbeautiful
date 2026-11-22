import { eq } from "drizzle-orm";
import { tenants } from "../drizzle/schema";
import type { getDb } from "./db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * The salon's own name, for a text or email to one of its clients.
 *
 * Null when the tenant row cannot be found; the message builders then say
 * "the salon" (shared/salonBrand.ts) rather than another salon's name.
 */
export async function loadSalonName(db: Db, tenantId: number): Promise<string | null> {
  const [row] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return row?.name?.trim() || null;
}
