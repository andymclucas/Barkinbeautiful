import { usePublicBrandTheme } from "@/hooks/usePublicBrandTheme";
import { SalonLogo } from "@/components/SalonLogo";
import { NewClientFormCard } from "@/components/NewClientFormCard";
import { salonName } from "@shared/salonBrand";

/**
 * The public New Client Form (Andy, 25/11/2026), on the client host at
 * /new-client. Branded with the salon's logo and colours: the page reads
 * the same public branding the online booking page does, and applies the
 * salon's palette to the theme, so buttons and accents are theirs.
 */
export default function NewClientForm() {
  const brand = usePublicBrandTheme();
  const salon = { name: brand.salonName, logoUrl: brand.logoUrl };
  const display = salonName(salon, "the salon");

  return (
    <main className="min-h-screen bg-gradient-to-b from-primary/15 via-background to-background px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 flex flex-col items-center gap-3 text-center">
          <SalonLogo brand={salon} className="h-20 w-auto max-w-[220px] rounded-xl" badgeClassName="h-16 w-16 rounded-2xl bg-primary text-xl text-primary-foreground" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">New client form</h1>
            <p className="mt-1 text-muted-foreground">
              Tell us about you and your dog, and {display} will be in touch to book you in.
            </p>
          </div>
        </header>
        <section className="rounded-3xl border bg-card p-5 shadow-xl sm:p-8">
          <NewClientFormCard salonDisplayName={display} />
        </section>
      </div>
    </main>
  );
}
