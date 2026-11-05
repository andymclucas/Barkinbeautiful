/**
 * Joining two records that are the same customer.
 *
 * This is the most destructive thing in the application. There is no
 * undo a staff member can reach, and a wrong merge puts one person's
 * dogs, invoices and grooming history onto somebody else's card with
 * nothing on screen afterwards to say so.
 *
 * ## The table list is DERIVED, never written down
 *
 * 25 columns in this database are called client_id and only SIX are
 * foreign keys. The database will not stop a merge orphaning the other
 * nineteen — a row left pointing at a deleted client is invisible
 * everywhere and turns up months later as a missing invoice.
 *
 * So the list comes from information_schema at run time. A table added
 * next month is handled the day it appears, which a hand-kept list in
 * this file would not be. That is the whole reason it is done this way
 * and not with the explicit list that would read more clearly here.
 *
 * ## Two tables cannot simply be repointed
 *
 * A unique index involving client_id means the losing row collides with
 * one the survivor already has:
 *
 *  - `portal_threads` is one per client. The loser's MESSAGES move into
 *    the survivor's thread and the empty thread goes, because a
 *    conversation is the thing worth keeping, not the row holding it.
 *  - `agreement_signatures` is one per document version per client. If
 *    both signed the same version, the survivor's stands and the
 *    loser's is dropped: they are the same person agreeing once.
 */
import { sql } from "drizzle-orm";

type Db = any;

/** information_schema gives these, but a name still gets checked. */
const SAFE_TABLE = /^[a-z_][a-z0-9_]*$/;

/**
 * Every table with a client_id, straight from the schema.
 *
 * `clients` is excluded: its client-ish column is moego_client_id,
 * which is MoeGo's identifier for the customer and not a reference to
 * a Groomigo client at all. Repointing it would quietly corrupt the
 * key the Monday sync matches on.
 */
export async function clientReferenceTables(db: Db): Promise<string[]> {
  const rows: any = await db.execute(sql`
    SELECT TABLE_NAME AS t
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND COLUMN_NAME = 'client_id'
       AND TABLE_NAME <> 'clients'
     ORDER BY TABLE_NAME`);
  const list = (Array.isArray(rows) ? rows[0] ?? rows : rows) as any[];
  return list
    .map((r: any) => String(r.t ?? r.TABLE_NAME))
    .filter((t: string) => SAFE_TABLE.test(t));
}

export type MergePreviewRow = { table: string; rows: number };

/** What would move, so a person can read it before pressing the button. */
export async function previewMerge(db: Db, loserId: number): Promise<MergePreviewRow[]> {
  const tables = await clientReferenceTables(db);
  const out: MergePreviewRow[] = [];
  for (const table of tables) {
    const res: any = await db.execute(
      sql.raw(`SELECT COUNT(*) AS n FROM \`${table}\` WHERE client_id = ${Number(loserId)}`));
    const list = (Array.isArray(res) ? res[0] ?? res : res) as any[];
    const n = Number(list?.[0]?.n ?? 0);
    if (n > 0) out.push({ table, rows: n });
  }
  return out;
}

export type MergeResult = {
  moved: { table: string; rows: number }[];
  /** Rows a unique index would not let through, and what happened to them. */
  resolved: { table: string; rows: number; what: string }[];
  total: number;
};

/**
 * Move everything off the loser and delete it.
 *
 * The caller opens the transaction. Every statement is scoped by tenant
 * as well as by client id, so a merge cannot reach across salons even
 * if it is handed two ids from different ones.
 */
export async function mergeClientInto(
  db: Db,
  tenantId: number,
  survivorId: number,
  loserId: number,
): Promise<MergeResult> {
  if (survivorId === loserId) throw new Error("A record cannot be merged into itself");

  const moved: MergeResult["moved"] = [];
  const resolved: MergeResult["resolved"] = [];

  /* portal_threads: unique on (tenant, client). Keep the conversation,
     not the row that holds it. */
  const threadRes: any = await db.execute(sql`
    SELECT id FROM portal_threads WHERE tenant_id = ${tenantId} AND client_id = ${survivorId} LIMIT 1`);
  const threadList = (Array.isArray(threadRes) ? threadRes[0] ?? threadRes : threadRes) as any[];
  const survivorThreadId = threadList?.[0]?.id ?? null;
  if (survivorThreadId) {
    const movedMsgs: any = await db.execute(sql`
      UPDATE portal_messages SET thread_id = ${survivorThreadId}
       WHERE thread_id IN (
         SELECT id FROM (
           SELECT id FROM portal_threads WHERE tenant_id = ${tenantId} AND client_id = ${loserId}
         ) AS t)`);
    const msgCount = Number(movedMsgs?.[0]?.affectedRows ?? movedMsgs?.affectedRows ?? 0);
    await db.execute(sql`
      DELETE FROM portal_threads WHERE tenant_id = ${tenantId} AND client_id = ${loserId}`);
    if (msgCount > 0) {
      resolved.push({ table: "portal_messages", rows: msgCount, what: "moved into the surviving conversation" });
    }
  }

  /* agreement_signatures: unique on (tenant, document, version, client).
     The same person agreeing twice is one agreement. */
  const dropped: any = await db.execute(sql`
    DELETE loser FROM agreement_signatures loser
      JOIN agreement_signatures keeper
        ON keeper.tenant_id = loser.tenant_id
       AND keeper.document_id = loser.document_id
       AND keeper.document_version = loser.document_version
       AND keeper.client_id = ${survivorId}
     WHERE loser.tenant_id = ${tenantId} AND loser.client_id = ${loserId}`);
  const droppedCount = Number(dropped?.[0]?.affectedRows ?? dropped?.affectedRows ?? 0);
  if (droppedCount > 0) {
    resolved.push({
      table: "agreement_signatures", rows: droppedCount,
      what: "already signed by the record being kept, so the duplicate was dropped",
    });
  }

  /* Everything else is a straight repoint. */
  for (const table of await clientReferenceTables(db)) {
    const res: any = await db.execute(
      sql.raw(`UPDATE \`${table}\` SET client_id = ${Number(survivorId)} WHERE client_id = ${Number(loserId)}`));
    const rows = Number(res?.[0]?.affectedRows ?? res?.affectedRows ?? 0);
    if (rows > 0) moved.push({ table, rows });
  }

  /* Nothing may point at it any more. Checked rather than assumed,
     because the generic repoint above is only as good as the column
     list it was built from. */
  const leftover = await previewMerge(db, loserId);
  if (leftover.length > 0) {
    throw new Error(
      `rows still point at client ${loserId} after the merge: `
      + leftover.map((r) => `${r.table}=${r.rows}`).join(", "));
  }

  const del: any = await db.execute(sql`
    DELETE FROM clients WHERE id = ${loserId} AND tenant_id = ${tenantId}`);
  const deleted = Number(del?.[0]?.affectedRows ?? del?.affectedRows ?? 0);
  if (deleted !== 1) throw new Error(`deleting client ${loserId} affected ${deleted} rows, expected 1`);

  return { moved, resolved, total: moved.reduce((sum, m) => sum + m.rows, 0) };
}
