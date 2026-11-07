/**
 * What Settings → Notifications shows about automated client texts.
 *
 * This exists because the browser CANNOT answer the question on its own.
 * The allow-list in shared/automatedSms.ts ships in the client bundle, so
 * the card could read that much directly — but a text also needs
 * `SMS_AUTOMATION_ENABLED=true`, which is server-side only and deliberately
 * carries no `VITE_` prefix. A card rendered from the allow-list alone
 * would show seven messages as going out while the environment held them
 * all back, which is the same class of untruth as the hand-written copy it
 * replaces, just pointing the other way.
 *
 * So the server reports the combined state and the card renders it.
 *
 * `protectedProcedure`: signed in and NOT a restricted staff account,
 * matching the Settings page itself — `/settings` is already closed to
 * restricted staff by isStaffOperationRoute. Deliberately not
 * `adminProcedure`, which would be no narrower here (six of eight users
 * hold users.role = "admin", four of them groomers) while adding nothing:
 * this returns salon-wide messaging policy, no client or pay data.
 */
import { router, protectedProcedure } from "../_core/trpc";
import { describeAutomatedSms } from "@shared/automatedSmsCatalogue";

export const automatedMessagesRouter = router({
  /** Every automated text, with the lock that currently applies to it. */
  list: protectedProcedure.query(async () => {
    const automationEnabled = process.env.SMS_AUTOMATION_ENABLED === "true";
    return {
      automationEnabled,
      messages: describeAutomatedSms(automationEnabled),
    };
  }),
});
