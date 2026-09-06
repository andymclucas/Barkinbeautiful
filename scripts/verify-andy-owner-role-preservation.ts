import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { getDb, upsertUser } from "../server/db";
import { ENV } from "../server/_core/env";

const USER_ID = 30001;

await upsertUser({
  openId: ENV.ownerOpenId,
  name: "Andy McLucas",
  email: "mclucas.andy@gmail.com",
  loginMethod: "manus",
  lastSignedIn: new Date(),
});

const db = await getDb();
const [user] = await db!.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, USER_ID)).limit(1);
if (!user || user.role !== "staff") {
  throw new Error(`Expected approved staff role to be preserved; received ${user?.role ?? "no account"}`);
}

console.log(JSON.stringify({ userId: user.id, role: user.role, ownerSynchronization: "preserved_existing_staff_role" }));
