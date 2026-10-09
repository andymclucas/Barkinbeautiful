import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { groomingReports } from "../drizzle/schema";
import {
  GROOMING_SHARE_TOKEN_LENGTH,
  buildGroomingShareToken,
} from "@shared/groomingShareToken";

/**
 * Minting and holding the token that makes a grooming card shareable.
 *
 * Kept out of routers.ts because the retry loop below is the kind of thing
 * that wants a name and a test, not another forty lines in a 7,900-line file.
 */

/** How many times to retry on the vanishingly unlikely unique-index clash. */
const MINT_ATTEMPTS = 5;

type Db = {
  select: (...args: any[]) => any;
  update: (...args: any[]) => any;
};

/**
 * Returns the report's share token, creating one the first time it is asked
 * for.
 *
 * Tokens are minted lazily rather than at report creation because most reports
 * are never shared by link, and an unused token is still a live credential if
 * the column ever leaks.
 *
 * The UPDATE is guarded with `share_token IS NULL` so two staff pressing
 * "share" at once cannot overwrite each other: the loser sees 0 rows affected,
 * re-reads, and returns the token the winner wrote. Without that guard the
 * second write would invalidate a link the first had already put in an SMS.
 */
export async function ensureGroomingShareToken(
  db: Db,
  reportId: number,
  tenantId: number,
): Promise<string> {
  for (let attempt = 0; attempt < MINT_ATTEMPTS; attempt++) {
    const [existing] = await db
      .select({ shareToken: groomingReports.shareToken })
      .from(groomingReports)
      .where(and(eq(groomingReports.id, reportId), eq(groomingReports.tenantId, tenantId)))
      .limit(1);
    if (!existing) throw new Error("Grooming card not found");
    if (existing.shareToken) return existing.shareToken;

    const token = buildGroomingShareToken(randomBytes(GROOMING_SHARE_TOKEN_LENGTH));
    try {
      const result = await db
        .update(groomingReports)
        .set({ shareToken: token })
        .where(and(
          eq(groomingReports.id, reportId),
          eq(groomingReports.tenantId, tenantId),
          // Only mint into an empty slot — see the note above.
          eq(groomingReports.shareToken, null as unknown as string),
        ));
      // Drizzle/mysql2 reports this differently across call shapes; when we
      // cannot tell, fall through and re-read rather than assume we won.
      const affected = (result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows;
      if (affected === undefined || affected > 0) {
        const [confirmed] = await db
          .select({ shareToken: groomingReports.shareToken })
          .from(groomingReports)
          .where(and(eq(groomingReports.id, reportId), eq(groomingReports.tenantId, tenantId)))
          .limit(1);
        if (confirmed?.shareToken) return confirmed.shareToken;
      }
    } catch (error) {
      // A unique-index clash means we drew a token already in use. With 120
      // bits that is a lottery win, but retrying costs nothing; anything else
      // is a real failure and should surface.
      if (!isDuplicateTokenError(error)) throw error;
    }
  }
  throw new Error("Could not allocate a share link for this grooming card");
}

/** MySQL/TiDB duplicate-key, narrowed to our index so we do not swallow others. */
export function isDuplicateTokenError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  const message = String((error as { message?: string })?.message ?? "");
  return code === "ER_DUP_ENTRY" || /duplicate entry/i.test(message);
}
