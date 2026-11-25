import { ClipboardList, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NewClientFormCard } from "@/components/NewClientFormCard";
import { salonName } from "@shared/salonBrand";

/**
 * Clients & Pets > New Client Form (Andy, 25/11/2026).
 *
 * The same one-page form a new client fills in on the salon's public
 * link, here for staff: share the link, or fill it in with the client at
 * the counter. Sending it adds the client and their dogs straight away;
 * no membership, product or service is chosen here.
 */
export default function NewClientFormStaff() {
  const utils = trpc.useUtils();
  const { data: brand } = trpc.settings.getPublicBranding.useQuery({ tenantId: 1 });
  const display = salonName({ name: brand?.name ?? null }, "the salon");
  const link = brand?.newClientFormUrl ?? "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy. Select the link and copy it instead.");
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ClipboardList className="h-6 w-6 text-primary" /> New Client Form
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A one-page form for new clients: their details and their dogs. Sending it adds them to Clients straight away, ready to ring and book in.
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-4 sm:p-5">
          <p className="text-sm font-semibold">Share the form</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Put this link on the website or socials, or send it to someone who rang. It opens with your logo and colours.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="h-10 font-mono text-xs" aria-label="New Client Form link" />
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-10 gap-1.5" onClick={copy} disabled={!link}>
                <Copy className="h-4 w-4" /> Copy
              </Button>
              <Button type="button" variant="outline" className="h-10 gap-1.5" asChild disabled={!link}>
                <a href={link || "#"} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Open</a>
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border bg-card p-5 shadow-sm sm:p-8">
          <p className="mb-6 text-sm text-muted-foreground">Filling it in with the client? Do it here.</p>
          <NewClientFormCard salonDisplayName={display} onDone={() => { void utils.clients.invalidate(); }} />
        </div>
      </div>
    </DashboardLayout>
  );
}
