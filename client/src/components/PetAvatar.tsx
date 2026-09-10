import { useState } from "react";
import { Dog } from "lucide-react";

// Small circular pet photo, falling back to an initial/icon placeholder when
// there's no photo on file yet (most pets, until the MoeGo photo migration
// finishes) or the image fails to load.
export function PetAvatar({ petId, petName, className = "h-7 w-7" }: { petId?: number | null; petName?: string | null; className?: string }) {
  const [errored, setErrored] = useState(false);
  if (!petId || errored) {
    return (
      <div className={`${className} rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0`}>
        {petName?.[0]?.toUpperCase() ?? <Dog className="h-3.5 w-3.5" />}
      </div>
    );
  }
  return (
    <img
      src={`/api/pets/${petId}/photo`}
      alt={petName ?? "Pet"}
      className={`${className} rounded-full object-cover shrink-0 bg-muted`}
      onError={() => setErrored(true)}
    />
  );
}
