/**
 * Would the guard refuse anything already on the board?
 *
 * The hermetic suite proves the RULE. Only the live diary can say
 * whether shipping it would stop staff booking a dog they are about to
 * book. Read-only: it asks the same question the guard asks, for every
 * dog due in the next fortnight, and reports every clash it would raise.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { findDogsAlreadyBookedThatDay } from "../server/duplicateBooking";
import { getDb } from "../server/db";

(async () => {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL!,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });
  const [rows] = (await c.query(
    /* The instant as an EXPLICIT UTC string, never the driver's Date.
       mysql2 converts a timestamp using the MACHINE clock on the way
       out, so on a Brisbane laptop `new Date(row.scheduled_start)` is
       ten hours off — and feeding that to the guard made one dog's
       groom on the 11th and bath on the 12th, which share a UTC date
       but not a Brisbane one, look like a same-day clash. The
       app never does this: it builds the instant with
       parseBrisbaneLocalDateTime. */
    `SELECT a.id, a.pet_id, p.name pet,
            DATE_FORMAT(a.scheduled_start,'%Y-%m-%dT%H:%i:%sZ') AS start_utc,
            DATE_FORMAT(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00'),'%d/%m/%Y %H:%i') AS when_bne
       FROM appointments a JOIN pets p ON p.id = a.pet_id
      WHERE a.tenant_id = 1
        AND a.scheduled_start >= UTC_TIMESTAMP()
        AND a.scheduled_start < DATE_ADD(UTC_TIMESTAMP(), INTERVAL 14 DAY)
        AND a.workflow_state NOT IN ('cancelled','no_show')
        AND a.status NOT IN ('cancelled','no_show')
      ORDER BY a.scheduled_start`
  )) as any;

  const db = await getDb();
  if (!db) throw new Error("no db");

  let clashes = 0;
  for (const row of rows as any[]) {
    /* Excluding the booking itself: the question is "would this dog be
       refused if it were being booked now", not "does it exist". */
    const found = await findDogsAlreadyBookedThatDay(db, {
      tenantId: 1,
      petIds: [row.pet_id],
      at: new Date(row.start_utc),
      excludeAppointmentIds: [row.id],
    });
    if (found.length > 0) {
      clashes += 1;
      console.log(
        `WOULD REFUSE  ${row.when_bne}  ${row.pet} (appointment ${row.id})`
      );
    }
  }
  console.log(
    `\n${rows.length} dogs due in the next 14 days — ${clashes} would be refused`
  );
  await c.end();
  process.exit(0);
})();
