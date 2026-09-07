import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export function resolveAutomaticOwnerRole(input: {
  requestedRole?: InsertUser["role"];
  isOwner: boolean;
  existingRole?: InsertUser["role"];
}): InsertUser["role"] | undefined {
  if (input.requestedRole !== undefined) return input.requestedRole;
  if (input.existingRole !== undefined) return undefined;
  return input.isOwner ? "admin" : undefined;
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // TiDB Cloud (and most managed MySQL-compatible hosts) require TLS.
      // Passing the connection string alone via mysql2's URI parsing does
      // not reliably enable SSL, so we build the pool explicitly here.
      const pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
      });
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const [existingUser] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.openId, user.openId))
      .limit(1);
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    const resolvedRole = resolveAutomaticOwnerRole({
      requestedRole: user.role,
      isOwner: user.openId === ENV.ownerOpenId,
      existingRole: existingUser?.role,
    });
    if (resolvedRole !== undefined) {
      values.role = resolvedRole;
      updateSet.role = resolvedRole;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.
