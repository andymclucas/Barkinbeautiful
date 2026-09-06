import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { Resend } from "resend";

const USER_ID = 30001;
const STAFF_ID = 60001;
const TENANT_ID = 1;
const EMAIL = "mclucas.andy@gmail.com";
const NAME = "Andy McLucas";
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const APP_ORIGIN = "https://groomingsos-mqzfsvzv.manus.space";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const databaseUrl = required("DATABASE_URL");
const resend = new Resend(required("RESEND_API_KEY"));
const from = process.env.INVITATION_FROM_EMAIL ?? process.env.RESEND_FROM_EMAIL ?? "noreply@barkinbeautiful.com.au";
const token = crypto.randomBytes(32).toString("hex");
const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
const invitationLink = `${APP_ORIGIN}/staff-invite/${token}`;
const connection = await mysql.createConnection(databaseUrl);

let invitationId;
try {
  await connection.beginTransaction();

  const [accounts] = await connection.execute(
    "SELECT id, name, email, role FROM users WHERE id = ? AND name = ? AND email = ? FOR UPDATE",
    [USER_ID, NAME, EMAIL],
  );
  const [staffRows] = await connection.execute(
    "SELECT id, tenant_id, user_id, portal_status FROM staff WHERE id = ? AND tenant_id = ? AND user_id = ? FOR UPDATE",
    [STAFF_ID, TENANT_ID, USER_ID],
  );
  if (accounts.length !== 1 || staffRows.length !== 1) {
    throw new Error("Expected Andy McLucas account and linked staff profile were not found");
  }

  await connection.execute(
    "UPDATE staff_invitations SET status = 'revoked' WHERE staff_id = ? AND status IN ('pending', 'accepted', 'approved')",
    [STAFF_ID],
  );
  await connection.execute(
    "UPDATE staff SET portal_status = 'revoked' WHERE id = ? AND tenant_id = ?",
    [STAFF_ID, TENANT_ID],
  );
  await connection.execute(
    "UPDATE users SET role = 'staff', passwordHash = NULL WHERE id = ?",
    [USER_ID],
  );
  await connection.execute(
    "INSERT INTO staff_access_events (tenant_id, staff_id, actor_user_id, event_type, note) VALUES (?, ?, ?, 'revoked', ?)",
    [TENANT_ID, STAFF_ID, USER_ID, "Direct staff access revoked before fresh account-setup invitation."],
  );

  const [result] = await connection.execute(
    "INSERT INTO staff_invitations (tenant_id, staff_id, email, token_hash, status, expires_at, invited_by_user_id) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
    [TENANT_ID, STAFF_ID, EMAIL, tokenHash, expiresAt, USER_ID],
  );
  invitationId = result.insertId;
  await connection.execute(
    "UPDATE staff SET email = ?, portal_status = 'invited' WHERE id = ? AND tenant_id = ?",
    [EMAIL, STAFF_ID, TENANT_ID],
  );
  await connection.execute(
    "INSERT INTO staff_access_events (tenant_id, staff_id, invitation_id, actor_user_id, event_type, note) VALUES (?, ?, ?, ?, 'invited', ?)",
    [TENANT_ID, STAFF_ID, invitationId, USER_ID, "Fresh existing-account setup invitation issued."],
  );
  await connection.commit();
} catch (error) {
  await connection.rollback();
  throw error;
}

try {
  const { error } = await resend.emails.send({
    from,
    to: EMAIL,
    subject: "Set up your Groomigo staff account",
    html: `<p>Hi Andy,</p><p>Your previous staff access has been revoked and a new secure setup invitation has been created.</p><p><a href="${invitationLink}">Set up my staff account</a></p><p>This link expires in seven days. Choose a new password, then your salon administrator must approve the staff account before access is enabled.</p>`,
  });
  if (error) throw new Error(`Resend rejected the invitation: ${error.message ?? "unknown error"}`);
  console.log(JSON.stringify({ invitationId, email: EMAIL, expiresAt: expiresAt.toISOString(), emailSent: true }));
} catch (error) {
  await connection.execute("UPDATE staff_invitations SET status = 'revoked' WHERE id = ?", [invitationId]);
  await connection.execute("UPDATE staff SET portal_status = 'revoked' WHERE id = ? AND tenant_id = ?", [STAFF_ID, TENANT_ID]);
  throw error;
} finally {
  await connection.end();
}
