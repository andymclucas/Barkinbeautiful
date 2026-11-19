import { describe, expect, it } from "vitest";
import { badgeText, firstNotificationTab, notificationTabCounts, notificationTotal } from "./notificationTabs";

const none = { unreadMessages: 0, assignedToMe: 0, unreadSystem: 0, reportUpdates: 0, failedPayments: 0 };

describe("notificationTabCounts", () => {
  it("puts each kind under the tab Andy named for it", () => {
    expect(notificationTabCounts({ unreadMessages: 4, assignedToMe: 2, unreadSystem: 9, reportUpdates: 1, failedPayments: 3 }))
      .toEqual({ messages: 6, system: 10, payments: 3 });
  });

  it("never counts a negative or a broken number", () => {
    expect(notificationTabCounts({ ...none, unreadMessages: -2, failedPayments: Number.NaN })).toEqual({ messages: 0, system: 0, payments: 0 });
  });
});

describe("notificationTotal", () => {
  it("is the sum of the three tabs, so the bell and the tabs agree", () => {
    expect(notificationTotal({ unreadMessages: 4, assignedToMe: 2, unreadSystem: 9, reportUpdates: 1, failedPayments: 3 })).toBe(19);
    expect(notificationTotal(none)).toBe(0);
  });
});

describe("firstNotificationTab", () => {
  it("opens on Payments when a payment has failed, whatever else is waiting", () => {
    expect(firstNotificationTab({ ...none, unreadMessages: 6, unreadSystem: 9, failedPayments: 1 })).toBe("payments");
  });

  it("opens on Messages before System", () => {
    expect(firstNotificationTab({ ...none, unreadMessages: 1, unreadSystem: 9 })).toBe("messages");
    expect(firstNotificationTab({ ...none, assignedToMe: 1 })).toBe("messages");
  });

  it("opens on System only when it is the only thing unread, and on Messages when nothing is", () => {
    expect(firstNotificationTab({ ...none, reportUpdates: 1 })).toBe("system");
    expect(firstNotificationTab(none)).toBe("messages");
  });
});

describe("badgeText", () => {
  it("stops at 9+", () => {
    expect(badgeText(3)).toBe("3");
    expect(badgeText(9)).toBe("9");
    expect(badgeText(10)).toBe("9+");
  });
});

import { unreadPortalThreads } from "./notificationTabs";

describe("unreadPortalThreads", () => {
  it("keeps the portal conversations waiting on the salon, one per client", () => {
    const threads = [{ id: 1, unread: 3 }, { id: 2, unread: 0 }, { id: 3 }, { id: 4, unread: 1 }];
    expect(unreadPortalThreads(threads).map((t) => t.id)).toEqual([1, 4]);
  });

  it("is empty before the list has loaded", () => {
    expect(unreadPortalThreads(undefined)).toEqual([]);
  });
});
