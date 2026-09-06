import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const email = "barkinbeautiful@hotmail.com.au";
const password = "Keesha84!";
const name = "Lauren Romari";
const openId = "local_admin_barkinbeautiful";

const hash = await bcrypt.hash(password, 12);

const conn = await mysql.createConnection(DATABASE_URL);

// Check if user already exists
const [existing] = await conn.execute(
  "SELECT id FROM users WHERE email = ? LIMIT 1",
  [email]
);

if (existing.length > 0) {
  // Update existing user
  await conn.execute(
    `UPDATE users SET passwordHash = ?, name = ?, role = 'admin', loginMethod = 'email', tenantId = 1 WHERE email = ?`,
    [hash, name, email]
  );
  console.log("✅ Admin user updated:", email);
} else {
  // Insert new user
  await conn.execute(
    `INSERT INTO users (openId, name, email, loginMethod, passwordHash, role, lastSignedIn, createdAt, updatedAt)
     VALUES (?, ?, ?, 'email', ?, 'admin', NOW(), NOW(), NOW())`,
    [openId, name, email, hash]
  );
  console.log("✅ Admin user created:", email);
}

await conn.end();
console.log("Done.");
