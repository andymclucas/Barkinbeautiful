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
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
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
      /**
       * Which kinds to look in. Narrowed on the SERVER rather than
       * filtered in the browser, so turning dogs off hands those slots
       * to clients and appointments instead of leaving gaps.
       */
      kinds: z.array(z.enum(["pet", "client", "appointment"])).min(1).optional(),
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
      const wanted = new Set(input.kinds ?? ["pet", "client", "appointment"]);
      const hits: SearchHit[] = [];

      // ── Clients ────────────────────────────────────────────────────
      // A phone typed with spaces must match a phone stored without
      // them, and the other way round, so the COLUMN is stripped too.
      const clientRows = wanted.has("client") ? await db
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
        .limit(25) : [];

      /*
       * Every matched client's dogs, in one query rather than one each.
       *
       * Andy, 03/11/2026: "show the dog or all dogs in the family that
       * can be clickable when searching with the main search function."
       *
       * Active only - `pets.status` is active|departed|archived, and departed is
       * how this salon retires a duplicate, so offering one is a link to
       * a record nobody wants reopened.
       */
      const dogsByClient = new Map<number, { id: number; name: string }[]>();
      if (clientRows.length > 0) {
        const owned = await db
          .select({ id: pets.id, name: pets.name, clientId: pets.clientId })
          .from(pets)
          .where(and(
            eq(pets.tenantId, tenantId),
            eq(pets.status, "active"),
            inArray(pets.clientId, clientRows.map((c: { id: number }) => c.id)),
          ))
          .orderBy(pets.name);
        for (const d of owned) {
          if (d.clientId === null) continue;
          const list = dogsByClient.get(d.clientId) ?? [];
          list.push({ id: d.id, name: d.name ?? "(no name)" });
          dogsByClient.set(d.clientId, list);
        }
      }

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
          dogs: dogsByClient.get(c.id) ?? [],
        });
      }

      // ── Dogs ───────────────────────────────────────────────────────
      if (!phoneSearch && wanted.has("pet")) {
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
      if (!phoneSearch && wanted.has("appointment")) {
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
      /*
       * Only cap the kinds actually being searched. Capping a kind that
       * was switched off would reserve slots nothing can fill.
       */
      const caps = {
        pet: wanted.has("pet") ? 6 : 0,
        client: wanted.has("client") ? 4 : 0,
        appointment: wanted.has("appointment") ? 4 : 0,
      };
      return capPerKind(rankHits(hits, q), caps, input.limit);
    }),
});
