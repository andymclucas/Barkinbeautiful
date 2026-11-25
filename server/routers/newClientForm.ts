/**
 * The New Client Form: a public, one-page intake (Andy, 25/11/2026).
 *
 * A new client types their details and their dogs; the client and dogs are
 * created straight away so staff can ring them and book them in. Nothing
 * here offers a service, a membership, a product or a price, and nothing
 * is charged or texted.
 *
 * ## Why it is public, and how that is kept safe
 *
 * It is `publicProcedure` because the person filling it in has no account
 * yet: the link goes on the salon's website, socials or a counter iPad.
 * Three things keep a stranger from doing harm with it:
 *
 *  - It only ever CREATES a new client. A phone or email that matches an
 *    existing client changes nothing on that record; staff are told to
 *    check it instead. Otherwise anyone who knew a client's number could
 *    add dogs to their file.
 *  - A hidden "website" field that people never see. A bot that fills
 *    every field is told it worked and nothing is saved.
 *  - A per-connection limit of a few sends an hour, held in memory. It
 *    resets on deploy, which is fine for a form a person fills in once.
 */
import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, tenantOf } from "../_core/trpc";
import { getDb } from "../db";
import { clients, pets } from "../../drizzle/schema";
import { properName } from "@shared/personName";
import {
  NEW_CLIENT_FORM_MAX_DOGS,
  NEW_CLIENT_FORM_SOURCE,
  dateOfBirthFromAge,
  filledDogs,
  newClientFormProblems,
} from "@shared/newClientForm";
import { notifyOwner } from "../ownerNotification";

const SENDS_PER_HOUR = 5;
const sendsByConnection = new Map<string, number[]>();

/** True when this connection has sent too many in the last hour. Records the attempt. */
export function overSendLimit(key: string, now = Date.now()): boolean {
  const hourAgo = now - 60 * 60 * 1000;
  const recent = (sendsByConnection.get(key) ?? []).filter((at) => at > hourAgo);
  if (recent.length >= SENDS_PER_HOUR) {
    sendsByConnection.set(key, recent);
    return true;
  }
  recent.push(now);
  sendsByConnection.set(key, recent);
  return false;
}

const dogInput = z.object({
  name: z.string().max(100),
  breed: z.string().max(100),
  ageYears: z.number().min(0).max(30).nullable(),
  weightKg: z.number().min(0).max(120).nullable(),
});

export const newClientFormRouter = router({
  submit: publicProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      firstName: z.string().max(100),
      lastName: z.string().max(100),
      phone: z.string().max(30),
      email: z.string().max(320),
      address: z.string().max(500),
      dogs: z.array(dogInput).max(NEW_CLIENT_FORM_MAX_DOGS + 2),
      /** Never shown to a person. Anything in it is a bot. */
      website: z.string().max(200).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // A bot is told it worked, and nothing is kept.
      if (input.website && input.website.trim() !== "") return { ok: true as const };

      const problems = newClientFormProblems(input);
      if (problems.length > 0) throw new TRPCError({ code: "BAD_REQUEST", message: problems[0] });

      const connection = String(
        (ctx.req?.headers?.["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
          ?? ctx.req?.socket?.remoteAddress
          ?? "unknown",
      );
      if (overSendLimit(connection)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Thanks, we've already got your details. Please call the salon if anything has changed." });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Please try again in a minute." });
      const tenantId = tenantOf(ctx, input);

      const email = input.email.trim().toLowerCase();
      const phone = input.phone.trim();
      const name = properName(input);
      const dogs = filledDogs(input.dogs);
      const dogLines = dogs.map((dog) => [
        dog.name,
        dog.breed,
        dog.ageYears != null ? `${dog.ageYears} yrs` : null,
        dog.weightKg != null ? `${dog.weightKg} kg` : null,
      ].filter(Boolean).join(", "));

      // Already a client: change nothing, tell staff.
      const [existing] = await db.select({ id: clients.id }).from(clients)
        .where(and(eq(clients.tenantId, tenantId), or(eq(clients.email, email), eq(clients.phone, phone))))
        .limit(1);
      if (existing) {
        await notifyOwner({
          title: `New client form: ${name.firstName} ${name.lastName} matches an existing client`,
          content: [
            `Client #${existing.id} already has this phone or email, so nothing was changed.`,
            `Phone: ${phone}. Email: ${email}. Address: ${input.address.trim()}.`,
            `Dogs: ${dogLines.join("; ")}.`,
            "Check their record and add anything new by hand.",
          ].join(" "),
        }).catch(() => undefined);
        return { ok: true as const };
      }

      const [created] = await db.insert(clients).values({
        tenantId,
        ...name,
        phone,
        email,
        address: input.address.trim(),
        status: "active",
        referralSource: NEW_CLIENT_FORM_SOURCE,
      });
      const clientId = (created as unknown as { insertId: number }).insertId;

      const now = new Date();
      for (const dog of dogs) {
        await db.insert(pets).values({
          tenantId,
          clientId,
          name: dog.name,
          breed: dog.breed || null,
          dateOfBirth: dateOfBirthFromAge(dog.ageYears, now),
          ...(dog.weightKg != null ? { weightKg: String(dog.weightKg), weight: String(dog.weightKg) } : {}),
        });
      }

      await notifyOwner({
        title: `New client form: ${name.firstName} ${name.lastName}`,
        content: [
          `Added as client #${clientId}, ready to ring and book in.`,
          `Phone: ${phone}. Email: ${email}.`,
          `Dogs: ${dogLines.join("; ")}.`,
        ].join(" "),
      }).catch(() => undefined);

      return { ok: true as const };
    }),
});
