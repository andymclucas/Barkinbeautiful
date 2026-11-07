import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClientMessagingCardView } from "./ClientMessagingCard";
import { describeAutomatedSms } from "@shared/automatedSmsCatalogue";

/**
 * The card that tells the owner which automated texts reach his clients.
 *
 * Tested through the View, which takes plain props and no tRPC — the shape
 * CLAUDE.md §7 asks for, and the reason the component is split in two.
 *
 * These are rendering assertions on purpose. The RULE — which message is
 * on, off, or merely paused — is tested in server/automatedSmsCatalogue
 * .test.ts against the allow-list itself. What is worth checking here is
 * the thing that actually went wrong: the screen said one thing while the
 * code did another, and it carried four buttons that did nothing at all.
 */
const view = (automationEnabled: boolean) =>
  render(
    <ClientMessagingCardView
      automationEnabled={automationEnabled}
      messages={describeAutomatedSms(automationEnabled)}
    />,
  );

describe("the client messaging card", () => {
  it("names the messages that are going out, with the gate on", () => {
    view(true);
    // The four Andy switched on on 04/11, which the old card said were off.
    expect(screen.getByText("Booking confirmation")).toBeInTheDocument();
    expect(screen.getByText("Appointment reminders")).toBeInTheDocument();
    expect(screen.getByText("Booking cancelled")).toBeInTheDocument();
    expect(screen.getByText("Booking moved")).toBeInTheDocument();
    expect(screen.getByText(/Going out automatically/i)).toBeInTheDocument();
  });

  it("never claims automated texts are switched off when they are not", () => {
    // The actual bug, as an assertion. The old card's copy read
    // "automated texts to clients are switched off" while seven types
    // were allow-listed.
    view(true);
    expect(screen.queryByText(/automated texts to clients are switched off/i)).toBeNull();
    expect(
      screen.getByText(/automated texts can reach a client right now/i),
    ).toBeInTheDocument();
  });

  it("says plainly when the salon-wide gate is holding everything", () => {
    view(false);
    expect(
      screen.getByText(/Automated texting is switched off for the whole salon/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/No automated text can reach a client right now/i)).toBeInTheDocument();
    // Allow-listed messages are "Paused", not "Off" — the distinction the
    // old card could not express, and the one that tells the owner whether
    // a message is a decision or a misconfiguration.
    expect(screen.getByText(/held by the salon switch/i)).toBeInTheDocument();
  });

  it("shows no gate warning once automation is on", () => {
    view(true);
    expect(screen.queryByText(/switched off for the whole salon/i)).toBeNull();
  });

  it("offers no button that does nothing", () => {
    // Four "Configure" buttons used to sit here, each raising "Feature
    // coming soon". The Workflow board's dead "Add Walk-in" button was
    // the same mistake and was removed the same day.
    view(true);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/coming soon/i)).toBeNull();
    expect(screen.queryByText(/Configure/i)).toBeNull();
  });

  it("drops the two staff alerts that were never client texts", () => {
    // They sat under a heading reading "Texts the system sends on the
    // salon's behalf", which implied the salon texted clients about
    // retail stock. Low stock has no alert implemented anywhere; failed
    // payments already reach staff through the notification system.
    view(true);
    expect(screen.queryByText(/Low stock/i)).toBeNull();
    expect(screen.queryByText(/Failed payment alerts/i)).toBeNull();
  });

  it("says that switching a held-back message on means changing code", () => {
    view(true);
    expect(screen.getByText(/Deliberately off/i)).toBeInTheDocument();
    expect(screen.getByText(/a code change, not a setting/i)).toBeInTheDocument();
  });

  it("warns that the rebook nudge needs its own switch as well", () => {
    // "On" alone would be misleading: it is allow-listed but the per-salon
    // column defaults to false and the daily run does not exist yet.
    view(true);
    expect(screen.getByText(/Time to rebook/i)).toBeInTheDocument();
    expect(screen.getByText(/needs its own switch above/i)).toBeInTheDocument();
  });
});
