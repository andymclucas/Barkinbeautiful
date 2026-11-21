import { cn } from "@/lib/utils";
import { salonInitials, salonLogoSrc, salonName, type SalonBrand } from "@shared/salonBrand";

/**
 * The signed-in salon's own logo, or its initials when it has not uploaded
 * one. Never another salon's picture — see shared/salonBrand.ts.
 */
export function SalonLogo({ brand, className, badgeClassName }: {
  brand: SalonBrand | null | undefined;
  /** Size and framing for the image. */
  className?: string;
  /** Size and framing for the initials badge; defaults to `className`. */
  badgeClassName?: string;
}) {
  const src = salonLogoSrc(brand);
  const name = salonName(brand, "");
  if (src) return <img src={src} alt={name || "Salon logo"} className={cn("object-contain", className)} />;
  const initials = salonInitials(name);
  if (!initials) return null;
  return (
    <span
      aria-label={name}
      className={cn("inline-flex items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground", badgeClassName ?? className)}
    >
      {initials}
    </span>
  );
}
