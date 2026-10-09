import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Tap-to-add-a-photo button for a dog, for use anywhere the pet is already on
 * screen.
 *
 * This exists because the groomers were going Calendar -> Clients -> search ->
 * client -> Pets tab -> Add photo just to put a face on a dog they had just
 * finished. From an appointment we already know the pet, so the detour is
 * three screens of nothing.
 *
 * It deliberately does NOT reuse `PetAvatar`. That component is a quiet little
 * picture: a dog with no photo yet shows a faint grey initial, which is right
 * on a crowded board and useless as a button - the first version of this did
 * reuse it and the control was invisible. So the two states are drawn
 * differently here:
 *
 *   no photo yet -> a dashed camera circle in the accent colour, which reads
 *                   as "put something here"
 *   has a photo  -> the photo, with a solid camera badge on the corner
 *
 * It posts to the same `/api/upload/pet-groom-photo` route the client record
 * uses, passing `appointmentId` so the photo is filed against the groom it was
 * taken at. There is no separate "profile photo" upload to make: `PetAvatar`
 * already falls back to the most recent grooming photo when no profile photo
 * is set, so the first photo added here becomes the dog's picture everywhere.
 */
export function PetPhotoQuickAdd({
  petId,
  petName,
  appointmentId,
  className = "h-10 w-10",
  onUploaded,
}: {
  petId: number;
  petName?: string | null;
  appointmentId?: number | null;
  className?: string;
  onUploaded?: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [hasPhoto, setHasPhoto] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Photo must be 20 MB or smaller");
      return;
    }
    setUploading(true);
    try {
      const caption = encodeURIComponent(file.name.replace(/\.[^.]+$/, ""));
      const query = new URLSearchParams({ petId: String(petId), caption });
      if (appointmentId) query.set("appointmentId", String(appointmentId));
      const response = await fetch(`/api/upload/pet-groom-photo?${query}`, {
        method: "POST",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Photo upload failed");
      // The photo URL is stable and cached for a day, so a fresh upload needs a
      // new one or the browser keeps serving the old image (or the 404).
      setHasPhoto(true);
      setRefreshKey((key) => key + 1);
      toast.success(`Photo added to ${petName ?? "this pet"}`);
      onUploaded?.();
    } catch (error: any) {
      toast.error(error.message ?? "Photo upload failed");
    } finally {
      setUploading(false);
      // Clear the input so choosing the same file twice still fires onChange.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const label = hasPhoto
    ? `Change ${petName ?? "this pet"}'s photo`
    : `Add a photo of ${petName ?? "this pet"}`;

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      disabled={uploading}
      title={label}
      aria-label={label}
      className="relative shrink-0 rounded-full group disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {hasPhoto ? (
        <img
          src={`/api/pets/${petId}/photo?v=thumb96${refreshKey ? `&r=${refreshKey}` : ""}`}
          loading="lazy"
          decoding="async"
          alt={petName ?? "Pet"}
          onError={() => setHasPhoto(false)}
          className={`${className} rounded-full object-cover bg-muted ring-2 ring-primary/40 transition group-hover:ring-primary`}
        />
      ) : (
        <span
          className={`${className} flex items-center justify-center rounded-full border-2 border-dashed border-primary/60 bg-primary/10 text-primary transition group-hover:border-primary group-hover:bg-primary/20`}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        </span>
      )}

      {/* Corner badge only once there is a photo - the empty state is already a
          camera, and two cameras reads as clutter. */}
      {hasPhoto && (
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background shadow-sm transition-transform group-hover:scale-110">
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
        </span>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </button>
  );
}
