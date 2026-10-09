import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PetAvatar } from "@/components/PetAvatar";

/**
 * The dog's avatar with a camera badge: tap it to add a photo without leaving
 * whatever screen you are on.
 *
 * This exists because the groomers were going Calendar -> Clients -> search ->
 * client -> Pets tab -> Add photo just to put a face on a dog they had just
 * finished. From an appointment we already know the pet, so the detour is
 * three screens of nothing.
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
  className = "h-9 w-9",
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

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      disabled={uploading}
      title={`Add a photo of ${petName ?? "this pet"}`}
      aria-label={`Add a photo of ${petName ?? "this pet"}`}
      className="relative shrink-0 rounded-full group disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
      <PetAvatar petId={petId} petName={petName} className={className} refreshKey={refreshKey} />
      {/* Sits mostly outside the circle: on a dog that already has a photo this
          badge would otherwise cover its face. */}
      <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background transition-transform group-hover:scale-110">
        {uploading ? <Loader2 className="h-2 w-2 animate-spin" /> : <Camera className="h-2 w-2" />}
      </span>
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
