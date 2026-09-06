import crypto from "node:crypto";
import { writeFile, chmod } from "node:fs/promises";
import mysql from "mysql2/promise";

const USER_ID = 30001;
const STAFF_ID = 60001;
const TENANT_ID = 1;
const EMAIL = "mclucas.andy@gmail.com";
const NAME = "Andy McLucas";
const TOKEN_FILE = "/tmp/andy-groomigo-staff-invite-token";
const token = crypto.randomBytes(32).toString("hex");
const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error("DATABASE_URL is required");

const connection = await mysql.createConnection(databaseUrl);
try {
  await connection.beginTransaction();
  const [accounts] = await connection.execute(
    "SELECT id FROM users WHERE id = ? AND name = ? AND email = ? FOR UPDATE",
    [USER_ID, NAME, EMAIL],
  );
  const [staffRows] = await connection.execute(
    "SELECT id FROM staff WHERE id = ? AND tenant_id = ? AND user_id = ? FOR UPDATE",
    [STAFF_ID, TENANT_ID, USER_ID],
  );
  if (accounts.length !== 1 || staffRows.length !== 1) throw new Error("Expected linked Andy staff account was not found");

  await connection.execute(
    "UPDATE staff_invitations SET status = 'revoked' WHERE staff_id = ? AND status = 'pending'",
    [STAFF_ID],
  );
  const [insertResult] = await connection.execute(
    "INSERT INTO staff_invitations (tenant_id, staff_id, email, token_hash, status, expires_at, invited_by_user_id) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
    [TENANT_ID, STAFF_ID, EMAIL, tokenHash, expiresAt, USER_ID],
  );
  await connection.execute(
    "UPDATE users SET role = 'staff', passwordHash = NULL WHERE id = ?",
    [USER_ID],
  );
  await connection.execute(
    "UPDATE staff SET portal_status = 'invited' WHERE id = ? AND tenant_id = ?",
    [STAFF_ID, TENANT_ID],
  );
  await connection.execute(
    "INSERT INTO staff_access_events (tenant_id, staff_id, invitation_id, actor_user_id, event_type, note) VALUES (?, ?, ?, ?, 'invited', ?)",
    [TENANT_ID, STAFF_ID, insertResult.insertId, USER_ID, "No-email invitation state prepared solely for staff setup-screen validation."],
  );
  await connection.commit();
  await writeFile(TOKEN_FILE, token, { mode: 0o600 });
  await chmod(TOKEN_FILE, 0o600);
  console.log(JSON.stringify({ invitationId: insertResult.insertId, expiresAt: expiresAt.toISOString(), emailDelivery: "not_attempted" }));
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
