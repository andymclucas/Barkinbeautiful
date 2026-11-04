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
 * The photo resolves to the dog's most recent grooming photo, falling back to
 * the `pets.photo_data` column - see shared/petProfilePhoto.ts for why that
 * way round.
 *
 * `version` is for the person who just changed the picture. The route's own
 * cache life is short, but "short" is still long enough to look broken to
 * somebody who has just deleted the wrong dog's photo and is staring at it.
 * Bump this after any change and their browser fetches a new URL at once.
 */
export function PetAvatar({ petId, petName, className = "h-7 w-7", version }: { petId?: number | null; petName?: string | null; className?: string; version?: number | string }) {
  const [errored, setErrored] = useState(false);
  /* A dog that had no photo must stop showing the placeholder once one
     is added, so a new version clears the failure from last time. */
  useEffect(() => { setErrored(false); }, [petId, version]);
  if (!petId || errored) {
    return (
      <div className={`${className} rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0`}>
        {petName?.[0]?.toUpperCase() ?? <Dog className="h-3.5 w-3.5" />}
      </div>
    );
  }
  return (
    <img
      src={`/api/pets/${petId}/photo?v=thumb96${version ? `&r=${version}` : ""}`}
      loading="lazy"
      decoding="async"
      alt={petName ?? "Pet"}
      className={`${className} rounded-full object-cover shrink-0 bg-muted`}
      onError={() => setErrored(true)}
    />
  );
}
