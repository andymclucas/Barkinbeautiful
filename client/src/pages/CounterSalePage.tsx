import DashboardLayout from "@/components/DashboardLayout";
import { CounterSale } from "@/components/CounterSale";

/**
 * The counter till on its own page, for the sidebar.
 *
 * Andy, 11/11/2026, asking how to sell to somebody who walks in without
 * an appointment. The till existed, but only on /retail, which nothing
 * linked to and restricted staff could not open — so the person at the
 * counter could not find it, and often was not allowed to use it.
 *
 * This page is the till and nothing else: no product editing, so it can
 * be open to every staff login.
 */
export default function CounterSalePage() {
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold font-display">Counter sale</h1>
          <p className="text-sm text-muted-foreground">
            Sell retail to someone without a booking. It goes on their client record and comes off the stock.
          </p>
        </div>
        <CounterSale />
      </div>
    </DashboardLayout>
  );
}
