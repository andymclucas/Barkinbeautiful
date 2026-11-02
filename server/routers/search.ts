/**
 * The search box in the header, for the whole app.
 *
 * Andy, 03/11/2026: "an overall 'search' button at the top which shows
 * regardless of the navigation tab. Search by any detail at all - also
 * can show appts and workflow items."
 *
 * One query, three tables, mixed results. Deliberately NOT a fourth
 * copy of the three searches that already exist — those stay, because
 * each is tuned to its page (the calendar wants every appointment for
 * a client; this wants the five best things of any kind).
 *
 * `operationalProcedure`: a groomer looking up a dog is the entire
 * point. Every query is tenant-scoped, and restricted staff get the
 * same tenant check the calendar's own search applies.
 *
 * Ranking is in shared/globalSearch.ts, not in SQL. Three LIKEs across
 * three tables cannot be ordered against each other in the database
 * without a UNION that TiDB would plan badly, and the rule is worth
 * reading and testing rather than burying in an ORDER BY.
 */
import { z } from "zod";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { router, operationalProcedure, tenantOf } from "../_core/trpc";
import { getDb } from "../db";
import { appointments, clients, pets } from "../../drizzle/schema";
import { requireApprovedStaffTenant } from "../staffAccess";
import {
  appointmentHref, capPerKind, looksLikePhone, normalisePhone, rankHits, type SearchHit,
} from "@shared/globalSearch";

/** Brisbane is UTC+10 with no DST, so the local day is a fixed shift. */
const BRISBANE = "+10:00";

export const searchRouter = router({
  everything: operationalProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      query: z.string().trim().min(2).max(80),
      limit: z.number().int().min(1).max(30).default(12),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const tenantId = tenantOf(ctx, input);
      const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
      if (portalStaff && portalStaff.tenantId !== tenantId) {
        throw new Error("Search is limited to your salon");
      }

      const q = input.query.trim();
      const like = `%${q}%`;
      const digits = normalisePhone(q);
      const phoneSearch = looksLikePhone(q) && digits.length >= 3;
      const hits: SearchHit[] = [];

      // ── Clients ────────────────────────────────────────────────────
      // A phone typed with spaces must match a phone stored without
      // them, and the other way round, so the COLUMN is stripped too.
      const clientRows = await db
        .select({
          id: clients.id,
          firstName: clients.firstName,
          lastName: clients.lastName,
          phone: clients.phone,
          email: clients.email,
          address: clients.address,
        })
        .from(clients)
        .where(and(
          eq(clients.tenantId, tenantId),
          phoneSearch
            ? sql`REGEXP_REPLACE(COALESCE(${clients.phone}, ''), '[^0-9]', '') LIKE ${`%${digits}%`}`
            : or(
                sql`${clients.firstName} LIKE ${like}`,
                sql`${clients.lastName} LIKE ${like}`,
                sql`CONCAT(${clients.firstName}, ' ', ${clients.lastName}) LIKE ${like}`,
                sql`${clients.email} LIKE ${like}`,
                sql`${clients.address} LIKE ${like}`,
              ),
        ))
        .limit(25);

      for (const c of clientRows) {
        const name = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "(no name)";
        // What matched, so a result found by phone or address says why
        // rather than looking like an unexplained extra row.
        const matchedOn = phoneSearch
          ? c.phone
          : [c.email, c.address].find((v) => v && v.toLowerCase().includes(q.toLowerCase())) ?? null;
        hits.push({
          kind: "client", id: c.id, title: name,
          subtitle: c.phone ?? c.email ?? null,
          matchedOn, href: `/clients/${c.id}`,
        });
      }

      // ── Dogs ───────────────────────────────────────────────────────
      if (!phoneSearch) {
        const petRows = await db
          .select({
            id: pets.id,
            name: pets.name,
            breed: pets.breed,
            clientId: pets.clientId,
            ownerFirst: clients.firstName,
            ownerLast: clients.lastName,
          })
          .from(pets)
          .leftJoin(clients, eq(clients.id, pets.clientId))
          .where(and(
            eq(pets.tenantId, tenantId),
            or(sql`${pets.name} LIKE ${like}`, sql`${pets.breed} LIKE ${like}`),
          ))
          .limit(25);

        for (const p of petRows) {
          const owner = `${p.ownerFirst ?? ""} ${p.ownerLast ?? ""}`.trim();
          hits.push({
            kind: "pet", id: p.id, title: p.name ?? "(no name)",
            subtitle: [owner || null, p.breed || null].filter(Boolean).join(" · ") || null,
            matchedOn: p.breed && p.breed.toLowerCase().includes(q.toLowerCase()) ? p.breed : null,
            // The dog's own section of its owner's record.
            href: `/clients/${p.clientId}?pet=${p.id}`,
          });
        }
      }

      // ── Appointments, including anything on the floor right now ────
      if (!phoneSearch) {
        const apptRows = await db
          .select({
            id: appointments.id,
            workflowState: appointments.workflowState,
            petName: pets.name,
            clientFirst: clients.firstName,
            clientLast: clients.lastName,
            day: sql<string>`DATE_FORMAT(CONVERT_TZ(${appointments.scheduledStart}, '+00:00', ${BRISBANE}), '%Y-%m-%d')`.as("day"),
            shown: sql<string>`DATE_FORMAT(CONVERT_TZ(${appointments.scheduledStart}, '+00:00', ${BRISBANE}), '%a %e %b, %l:%i %p')`.as("shown"),
          })
          .from(appointments)
          .leftJoin(pets, eq(pets.id, appointments.petId))
          .leftJoin(clients, eq(clients.id, appointments.clientId))
          .where(and(
            eq(appointments.tenantId, tenantId),
            or(
              sql`${pets.name} LIKE ${like}`,
              sql`CONCAT(${clients.firstName}, ' ', ${clients.lastName}) LIKE ${like}`,
            ),
          ))
          // Nearest first: a dog searched for is almost always the one
          // coming, not the one from two years ago.
          .orderBy(desc(appointments.scheduledStart))
          .limit(15);

        for (const a of apptRows) {
          const owner = `${a.clientFirst ?? ""} ${a.clientLast ?? ""}`.trim();
          hits.push({
            kind: "appointment", id: a.id,
            title: `${a.petName ?? "Dog"}${owner ? ` · ${owner}` : ""}`,
            subtitle: a.shown ?? null,
            matchedOn: null,
            href: appointmentHref(a.workflowState, a.day),
            workflowState: a.workflowState,
          });
        }
      }

      /*
       * Rank, then reserve room per kind. Ranking alone filled all
       * twelve slots with dogs on "bella" — twelve of them in this
       * salon — and the client and appointment groups never showed.
       */
      return capPerKind(
        rankHits(hits, q),
        { pet: 6, client: 4, appointment: 4 },
        input.limit,
      );
    }),
});
