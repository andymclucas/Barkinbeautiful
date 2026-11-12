import { describe, expect, it } from "vitest";
import { loadVipMembers } from "./vipMembers";

/** A db whose queries answer, in order, with the rows given. */
function queuedDb(answers: unknown[][]) {
  const queue = [...answers];
  const chain: any = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => Promise.resolve(queue.shift() ?? []),
  };
  return { select: () => chain, asked: () => answers.length - queue.length };
}

describe("loadVipMembers — who wears the VIP badge on their profile", () => {
  it("marks a client with an active plan, and every dog the plan covers", async () => {
    const db = queuedDb([
      [{ clientId: 15 }],               // clients holding an active plan
      [{ petId: 101 }],                 // plans' primary dogs
      [{ petId: 101 }, { petId: 102 }], // dogs the plans cover — 102 is the x2 second dog
    ]);
    const vip = await loadVipMembers(db, 1, { clientIds: [15, 16], petIds: [101, 102, 103] });
    expect([...vip.clients]).toEqual([15]);
    expect([...vip.pets].sort()).toEqual([101, 102]);
  });

  it("asks nothing when there is nobody to ask about", async () => {
    const db = queuedDb([]);
    const vip = await loadVipMembers(db, 1, { clientIds: [null, undefined], petIds: [] });
    expect(vip.clients.size + vip.pets.size).toBe(0);
    expect(db.asked()).toBe(0);
  });
});
