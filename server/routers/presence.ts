import { z } from "zod";
import { router, operationalProcedure, tenantOf } from "../_core/trpc";
import { heartbeat, leave } from "../presenceRegistry";

/**
 * Who else has this record open.
 *
 * `operationalProcedure`, not `protectedProcedure`: a bather and a
 * groomer are exactly the people who need to know somebody else is
 * already in a dog's appointment, and `protectedProcedure` rejects
 * restricted staff outright. The surface is small enough that this is
 * safe — a name and an initial, for a record the caller names, inside
 * their own salon.
 *
 * It deliberately does NOT check that the record exists or that the
 * caller may see it. Presence is write-your-own-name-on-a-list: a
 * caller who guessed an appointment id would learn only that somebody
 * in their own salon has it open, which they could see by walking to
 * the next bench. Adding a permission read per heartbeat — one every 20
 * seconds per open dialog — would cost more than it protects.
 */
export const presenceRouter = router({
  /** "Still here." Returns everyone else on the record. */
  heartbeat: operationalProcedure
    .input(z.object({
      tenantId: z.number().optional(),
      recordKey: z.string().trim().min(3).max(120),
    }))
    .mutation(({ input, ctx }) => {
      return heartbeat({
        tenantId: tenantOf(ctx, input),
        recordKey: input.recordKey,
        userId: ctx.user.id,
        // A staff member with no name on their user row still has to
        // show as somebody rather than as a blank avatar.
        name: ctx.user.name?.trim() || "A colleague",
      });
    }),

  /** "Closed it." Best-effort — the sweep catches anyone who cannot say so. */
  leave: operationalProcedure
    .input(z.object({
      tenantId: z.number().optional(),
      recordKey: z.string().trim().min(3).max(120),
    }))
    .mutation(({ input, ctx }) => {
      leave({
        tenantId: tenantOf(ctx, input),
        recordKey: input.recordKey,
        userId: ctx.user.id,
      });
      return { ok: true };
    }),
});
