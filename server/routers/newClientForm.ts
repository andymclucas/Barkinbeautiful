/**
 * The New Client Form: a public, one-page intake (Andy, 25/11/2026).
 *
 * A new client types their details and their dogs; the client and dogs are
 * created straight away so staff can ring them and book them in. Nothing
 * here offers a service, a membership, a product or a price. Staff can
 * send the link by SMS or email ("Make the intake form sent either via
 * email or SMS", Andy, 25/11/2026); nothing is ever sent automatically.
 *
 * ## Why `submit` is public, and how that is kept safe
 *
 * The person filling it in has no account yet: the link goes on the
 * salon's website, socials, a counter iPad, or a text staff send.
 *
 *  - The salon is never chosen by the caller. It comes from the host the
 *    page is served on (ctx.tenantId), and otherwise Barkin' Beautiful,
 *    the only salon this runs for today. A raw request naming another
 *    salon's number cannot write into it.
 *  - It only ever CREATES a new client. A phone (however it is typed) or
 *    email matching an existing client changes nothing on that record;
 *    staff are told to check it instead.
 *  - A hidden "website" field people never see. A bot that fills it is
 *    told it worked and nothing is saved.
 *  - A limit per connection, keyed on the address Render's proxy itself
 *    appends (the last x-forwarded-for entry; a client can forge the
 *    first), and a cap per salon per hour as a backstop. Staff signed in
 *    at the counter are not limited.
 *  - Everything a stranger typed is HTML-escaped before it goes into the
 *    owner's email, and line breaks are stripped from the subject.
 */
import { z } from "zod";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, operationalProcedure, tenantOf } from "../_core/trpc";
import { getDb } from "../db";
import { clients, pets, tenants } from "../../drizzle/schema";
import { properName } from "@shared/personName";
import { escapeHtml } from "@shared/escapeHtml";
import { clientSalonName } from "@shared/salonBrand";
import {
  NEW_CLIENT_FORM_MAX_DOGS,
  NEW_CLIENT_FORM_SOURCE,
  dateOfBirthFromAge,
  filledDogs,
  newClientFormProblems,
  newClientFormSms,
  phoneMatchForms,
} from "@shared/newClientForm";
import { notifyOwner } from "../ownerNotification";
import { getPortalBaseUrl } from "../appUrl";
import { sendSms } from "../sms";
import { sendEmail } from "../email";

const SENDS_PER_CONNECTION_PER_HOUR = 5;
const SENDS_PER_SALON_PER_HOUR = 40;
const HOUR = 60 * 60 * 1000;
const sendsByKey = new Map<string, number[]>();

/** True when this key has had `limit` sends in the last hour. Records the attempt otherwise. */
export function overLimit(key: string, limit: number, now = Date.now()): boolean {
  const recent = (sendsByKey.get(key) ?? []).filter((at) => at > now - HOUR);
  if (recent.length >= limit) {
    sendsByKey.set(key, recent);
    return true;
  }
  recent.push(now);
  sendsByKey.set(key, recent);
  // Keys that have gone quiet are dropped, so random keys cannot grow this forever.
  if (sendsByKey.size > 2000) {
    for (const [k, times] of sendsByKey) {
      if (!times.some((at) => at > now - HOUR)) sendsByKey.delete(k);
    }
  }
  return false;
}

/** The connection's address as Render's proxy saw it: the LAST forwarded entry. */
export function connectionKey(forwardedFor: string | string[] | undefined, socketAddress: string | undefined): string {
  const header = Array.isArray(forwardedFor) ? forwardedFor.join(",") : forwardedFor ?? "";
  const entries = header.split(",").map((part) => part.trim()).filter(Boolean);
  return entries[entries.length - 1] ?? socketAddress ?? "unknown";
}

const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

const dogInput = z.object({
  name: z.string().max(100),
  breed: z.string().max(100),
  ageYears: z.number().min(0).max(30).nullable(),
  weightKg: z.number().min(0).max(120).nullable(),
});

export const newClientFormRouter = router({
  submit: publicProcedure
    .input(z.object({
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

      // From the host, never from the request body.
      const tenantId = ctx.tenantId ?? 1;

      // Staff signed in at the counter are not limited; the public is.
      if (!ctx.user) {
        const key = connectionKey(ctx.req?.headers?.["x-forwarded-for"], ctx.req?.socket?.remoteAddress);
        if (overLimit(`conn:${key}`, SENDS_PER_CONNECTION_PER_HOUR) || overLimit(`salon:${tenantId}`, SENDS_PER_SALON_PER_HOUR)) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "We've had a lot of forms just now. Please try again in a little while, or give the salon a call." });
        }
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Please try again in a minute." });
      const [salon] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!salon) throw new TRPCError({ code: "NOT_FOUND", message: "This form is not available." });

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
      const safe = {
        name: escapeHtml(oneLine(`${name.firstName} ${name.lastName}`)),
        phone: escapeHtml(phone),
        email: escapeHtml(email),
        address: escapeHtml(oneLine(input.address)),
        dogs: escapeHtml(dogLines.join("; ")),
      };

      // Already a client: change nothing, tell staff. The phone is matched
      // however it was typed, against the stored number with spacing taken out.
      const forms = phoneMatchForms(phone);
      const storedPhone = sql`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${clients.phone}, ' ', ''), '-', ''), '(', ''), ')', ''), '.', '')`;
      const [existing] = await db.select({ id: clients.id }).from(clients)
        .where(and(
          eq(clients.tenantId, tenantId),
          forms.length > 0 ? or(eq(clients.email, email), inArray(storedPhone, forms)) : eq(clients.email, email),
        ))
        .limit(1);
      if (existing) {
        await notifyOwner({
          title: oneLine(`New client form: ${name.firstName} ${name.lastName} matches an existing client`),
          content: [
            `Client #${existing.id} already has this phone or email, so nothing was changed.`,
            `Phone: ${safe.phone}. Email: ${safe.email}. Address: ${safe.address}.`,
            `Dogs: ${safe.dogs}.`,
            "Check their record and add anything new by hand.",
          ].join(" "),
        }).catch(() => undefined);
        return { ok: true as const };
      }

      // One unit, so a failure part-way never leaves a client with half their dogs.
      const now = new Date();
      const clientId = await db.transaction(async (tx: any) => {
        const [created] = await tx.insert(clients).values({
          tenantId,
          ...name,
          phone,
          email,
          address: input.address.trim(),
          status: "active",
          referralSource: NEW_CLIENT_FORM_SOURCE,
        });
        const id = (created as { insertId: number }).insertId;
        for (const dog of dogs) {
          await tx.insert(pets).values({
            tenantId,
            clientId: id,
            name: dog.name,
            breed: dog.breed || null,
            dateOfBirth: dateOfBirthFromAge(dog.ageYears, now),
            ...(dog.weightKg != null ? { weightKg: String(dog.weightKg), weight: String(dog.weightKg) } : {}),
          });
        }
        return id;
      });

      await notifyOwner({
        title: oneLine(`New client form: ${name.firstName} ${name.lastName}`),
        content: [
          `${safe.name} was added as client #${clientId}, ready to ring and book in.`,
          `Phone: ${safe.phone}. Email: ${safe.email}.`,
          `Dogs: ${safe.dogs}.`,
        ].join(" "),
      }).catch(() => undefined);

      return { ok: true as const };
    }),

  /**
   * Send the form's link to someone, by SMS or email.
   *
   * A person presses Send, so the SMS is `trigger: "staff"` and is not
   * subject to the automated-text allow-list (CLAUDE.md §9). The person is
   * not a client yet, so there is no client thread to log it in; Twilio
   * and Resend hold the delivery record.
   */
  sendLink: operationalProcedure
    .input(z.object({
      channel: z.enum(["sms", "email"]),
      to: z.string().trim().min(3).max(320),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx);
      const [salon] = await db.select({ name: tenants.name, phone: tenants.phone, email: tenants.email })
        .from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      const salonDisplay = clientSalonName(salon?.name);
      const url = `${getPortalBaseUrl()}/new-client`;

      if (input.channel === "sms") {
        const digits = input.to.replace(/\D/g, "");
        if (digits.length < 8 || digits.length > 15) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "That doesn't look like a mobile number." });
        }
        const result = await sendSms(input.to, newClientFormSms(salonDisplay, url), { trigger: "staff", tenantId });
        if (!result.success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "The text could not be sent." });
        }
        return { ok: true as const, channel: "sms" as const };
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.to)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That doesn't look like an email address." });
      }
      const name = escapeHtml(salonDisplay);
      const ok = await sendEmail({
        to: input.to,
        subject: `${salonDisplay}: new client form`,
        fromName: salonDisplay,
        replyTo: salon?.email ?? null,
        html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#1a1a1a;background:#f9f9f9;margin:0;padding:0">
<div style="max-width:520px;margin:32px auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px">
  <h2 style="margin-top:0">Welcome to ${name}</h2>
  <p>Thanks for getting in touch. Please fill in our quick new client form with your details and your dog's, and we'll be in touch to book you in.</p>
  <p style="margin:28px 0"><a href="${url}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;font-weight:700;padding:13px 24px;border-radius:999px">Fill in the form</a></p>
  <p style="font-size:13px;color:#6b7280">Or open this link: <a href="${url}">${url}</a></p>
  <p>Warm regards,<br/><strong>${name}</strong></p>
</div></body></html>`,
      }).catch(() => false);
      if (!ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The email could not be sent." });
      return { ok: true as const, channel: "email" as const };
    }),
});
