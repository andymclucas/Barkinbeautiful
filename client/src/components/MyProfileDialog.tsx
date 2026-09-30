import { useEffect, useRef, useState } from "react";
import { IceCream2, ImageOff, ImagePlus, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StaffAvatar } from "@/components/StaffAvatar";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/**
 * A staff member's own details, editable by them.
 *
 * Everything here writes through staff.updateMyProfile, which is scoped by
 * the signed-in user in its WHERE clause and takes no staff id - so this
 * cannot be pointed at a colleague. Role, portal access and the
 * online-booking settings are deliberately absent: those are the owner's to
 * set, and a groomer changing their own role would be a privilege
 * escalation, not a preference.
 */

interface ProfileForm {
  name: string;
  email: string;
  phone: string;
  emergencyContact: string;
  emergencyPhone: string;
  emergencyEmail: string;
  favouriteIceCream: string;
}

const EMPTY: ProfileForm = {
  name: "", email: "", phone: "",
  emergencyContact: "", emergencyPhone: "", emergencyEmail: "",
  favouriteIceCream: "",
};

export function MyProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const { data: me, isLoading } = trpc.staff.getMyProfile.useQuery(undefined, { enabled: open });
  const [form, setForm] = useState<ProfileForm>(EMPTY);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Refill whenever the dialog opens, so a cancelled edit is really cancelled.
  useEffect(() => {
    if (!open || !me) return;
    setForm({
      name: me.name ?? "",
      email: me.email ?? "",
      phone: me.phone ?? "",
      emergencyContact: me.emergencyContact ?? "",
      emergencyPhone: me.emergencyPhone ?? "",
      emergencyEmail: me.emergencyEmail ?? "",
      favouriteIceCream: me.favouriteIceCream ?? "",
    });
  }, [open, me]);

  const refresh = () => {
    utils.staff.getMyProfile.invalidate();
    utils.staff.listOperational.invalidate();
  };

  const save = trpc.staff.updateMyProfile.useMutation({
    onSuccess: () => { toast.success("Profile saved"); refresh(); onOpenChange(false); },
    onError: (e) => toast.error(e.message),
  });

  const updatePhoto = trpc.staff.updateMyPhoto.useMutation({
    onSuccess: () => { toast.success("Photo updated"); refresh(); },
    onError: (e) => toast.error(e.message),
  });

  async function uploadPhoto(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("Image too large (max 8 MB)"); return; }
    setPhotoUploading(true);
    try {
      const res = await fetch("/api/upload/staff-photo", {
        method: "POST", headers: { "Content-Type": file.type }, body: file,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Upload failed");
      updatePhoto.mutate({ photoUrl: data.url });
    } catch (err: any) {
      toast.error(err?.message ?? "Could not upload the photo");
    } finally {
      setPhotoUploading(false);
    }
  }

  const set = (key: keyof ProfileForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const nameMissing = form.name.trim() === "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>My profile</DialogTitle>
          <DialogDescription>
            Your own details. Only you and the salon owner can change these.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : !me ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-300">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Your sign-in is not linked to a staff record on this salon yet, so there is
              nothing to edit. The owner can link it from the Staff page.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Photo */}
            <div className="flex items-center gap-4">
              <StaffAvatar
                photoUrl={me.photoUrl}
                name={me.name}
                colourHex={me.colourHex}
                className="h-16 w-16 shrink-0"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button" size="sm" variant="outline" className="gap-1.5"
                  disabled={photoUploading || updatePhoto.isPending}
                  onClick={() => photoInputRef.current?.click()}
                >
                  {photoUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                  {photoUploading ? "Uploading…" : me.photoUrl ? "Change photo" : "Add photo"}
                </Button>
                {me.photoUrl && (
                  <Button
                    type="button" size="sm" variant="outline"
                    className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/50"
                    disabled={updatePhoto.isPending}
                    onClick={() => updatePhoto.mutate({ photoUrl: null })}
                  >
                    <ImageOff className="h-3.5 w-3.5" /> Remove
                  </Button>
                )}
              </div>
              <input
                ref={photoInputRef} type="file" accept="image/*" className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPhoto(f); e.currentTarget.value = ""; }}
              />
            </div>

            {/* You */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="mp-name">Name</Label>
                <Input id="mp-name" value={form.name} onChange={set("name")} placeholder="Your name" />
                {nameMissing && <p className="text-xs text-red-600 dark:text-red-400">A name is required.</p>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="mp-email">Email</Label>
                  <Input id="mp-email" type="email" value={form.email} onChange={set("email")} placeholder="you@example.com" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mp-phone">Phone</Label>
                  <Input id="mp-phone" value={form.phone} onChange={set("phone")} placeholder="0400 000 000" />
                </div>
              </div>
            </div>

            {/* Emergency contact — same fields as your own */}
            <div className="space-y-3 rounded-xl border bg-muted/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Emergency contact
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="mp-ec-name">Name</Label>
                <Input id="mp-ec-name" value={form.emergencyContact} onChange={set("emergencyContact")} placeholder="Who should we call?" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="mp-ec-email">Email</Label>
                  <Input id="mp-ec-email" type="email" value={form.emergencyEmail} onChange={set("emergencyEmail")} placeholder="their@email.com" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mp-ec-phone">Phone</Label>
                  <Input id="mp-ec-phone" value={form.emergencyPhone} onChange={set("emergencyPhone")} placeholder="0400 000 000" />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mp-ice" className="flex items-center gap-1.5">
                <IceCream2 className="h-3.5 w-3.5 text-muted-foreground" /> Favourite flavour of ice cream
              </Label>
              <Input id="mp-ice" value={form.favouriteIceCream} onChange={set("favouriteIceCream")} placeholder="Salted caramel" />
            </div>
          </div>
        )}

        {me && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              disabled={nameMissing || save.isPending}
              onClick={() => save.mutate({ ...form, name: form.name.trim() })}
            >
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
