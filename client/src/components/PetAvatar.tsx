import { useEffect, useState } from "react";
import { Dog } from "lucide-react";

/**
 * Small circular pet photo, falling back to an initial/icon placeholder when
 * there is no photo on file yet or the image fails to load.
 *
 * The endpoint serves a 96px thumbnail. `v=thumb96` is a cache-buster, not a
 * parameter the server reads: the old route returned the full-size original
 * with `max-age=86400`, so without a new URL every browser that had already
 * loaded the board would keep serving a megabyte image from its own cache for
 * another day.
 *
 * The photo resolves to the dog's profile photo, or its most recent grooming
 * photo when no profile photo has been set - so a picture taken at the salon
 * reaches the Workflow board without anyone setting it as the profile.
 */
export function PetAvatar({ petId, petName, className = "h-7 w-7", refreshKey = 0 }: { petId?: number | null; petName?: string | null; className?: string; refreshKey?: number }) {
  const [errored, setErrored] = useState(false);
  // A freshly uploaded photo has to beat the browser cache, and `errored` has
  // to clear too - a dog with no photo yet renders the placeholder only
  // because the first request 404'd.
  useEffect(() => { setErrored(false); }, [refreshKey]);
  if (!petId || errored) {
    return (
      <div className={`${className} rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0`}>
        {petName?.[0]?.toUpperCase() ?? <Dog className="h-3.5 w-3.5" />}
      </div>
    );
  }
  return (
    <img
      src={`/api/pets/${petId}/photo?v=thumb96${refreshKey ? `&r=${refreshKey}` : ""}`}
      loading="lazy"
      decoding="async"
      alt={petName ?? "Pet"}
      className={`${className} rounded-full object-cover shrink-0 bg-muted`}
      onError={() => setErrored(true)}
    />
  );
}
