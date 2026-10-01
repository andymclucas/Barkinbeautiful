import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, ShieldOff, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  STAFF_SECTIONS, parseSections, type StaffSection,
} from "@shared/staffPermissions";

/**
 * Give, shape or revoke someone's admin rights - and remove them if they
 * leave.
 *
 * Rights and sections are two decisions, which is why this is a screen and
 * not a switch: "admin" used to be one bit that granted everything, so the
 * receptionist could not be given the clients list without also being given
 * wages. Granting rights opens this with nothing ticked, because a grant
 * nobody has scoped yet should permit nothing.
 */

export interface StaffRightsTarget {
  id: number;
  name: string;
  userId: number | null;
  isAdmin: boolean | null;
  adminSections: unknown;
}

export function StaffAdminRightsDialog({
  member,
  onOpenChange,
  onChanged,
}: {
  member: StaffRightsTarget | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const open = member !== null;
  const [isAdmin, setIsAdmin] = useState(false);
  const [sections, setSections] = useState<StaffSection[]>([]);
  const [confirmName, setConfirmName] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!member) return;
    setIsAdmin(Boolean(member.isAdmin));
    setSections(parseSections(member.adminSections));
    setConfirmName("");
    setConfirmingDelete(false);
  }, [member]);

  const save = trpc.staff.setAdminRights.useMutation({
    onSuccess: (r) => {
      toast.success(r.isAdmin ? "Admin rights saved" : "Admin rights revoked");
      onChanged();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = trpc.staff.deleteProfile.useMutation({
    onSuccess: (r) => {
      toast.success(r.message);
      onChanged();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  if (!member) return null;

  const toggle = (key: StaffSection) =>
    setSections((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  const allOn = sections.length === STAFF_SECTIONS.length;
  const noLogin = !member.userId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{member.name}</DialogTitle>
          <DialogDescription>
            Admin rights decide what this person can change. Everyone can already
            edit their own profile.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {noLogin && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-300">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {member.name} has no login yet, so rights cannot be granted. Invite
                them to the staff portal first.
              </p>
            </div>
          )}

          <button
            type="button"
            disabled={noLogin}
            onClick={() => setIsAdmin((v) => !v)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex items-center gap-2.5">
              {isAdmin
                ? <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                : <ShieldOff className="h-5 w-5 text-muted-foreground" />}
              <span>
                <span className="block text-sm font-semibold">
                  {isAdmin ? "Has admin rights" : "No admin rights"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {isAdmin ? "Tap to revoke" : "Tap to give admin rights"}
                </span>
              </span>
            </span>
            <Checkbox checked={isAdmin} disabled={noLogin} aria-label="Admin rights" />
          </button>

          {isAdmin && (
            <div className="space-y-2 rounded-xl border bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Can edit and change
                </p>
                <button
                  type="button"
                  className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
                  onClick={() => setSections(allOn ? [] : STAFF_SECTIONS.map((s) => s.key))}
                >
                  {allOn ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {STAFF_SECTIONS.map((s) => (
                  <label
                    key={s.key}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent/50"
                  >
                    <Checkbox checked={sections.includes(s.key)} onCheckedChange={() => toggle(s.key)} />
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
              {sections.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nothing ticked, so they can change nothing yet.
                </p>
              )}
            </div>
          )}

          {/* Leaving the salon */}
          <div className="rounded-xl border border-red-200 p-3 dark:border-red-900/50">
            {!confirmingDelete ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Remove this profile</p>
                  <p className="text-xs text-muted-foreground">If they have left the salon.</p>
                </div>
                <Button
                  size="sm" variant="outline"
                  className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/50"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                  Type <span className="font-mono">{member.name}</span> to confirm
                </p>
                <p className="text-xs text-muted-foreground">
                  If they have grooms against their name the profile is deactivated and
                  their access revoked instead, so the salon's history stays intact.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={confirmName}
                    onChange={(e) => setConfirmName(e.target.value)}
                    placeholder={member.name}
                    className="h-9 min-w-[12rem] flex-1"
                  />
                  <Button size="sm" variant="outline" onClick={() => setConfirmingDelete(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm" variant="destructive" className="gap-1.5"
                    disabled={
                      remove.isPending ||
                      confirmName.trim().toLowerCase() !== member.name.trim().toLowerCase()
                    }
                    onClick={() => remove.mutate({ staffId: member.id, confirmName })}
                  >
                    {remove.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Remove profile
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={save.isPending || (noLogin && isAdmin)}
            onClick={() => save.mutate({ staffId: member.id, isAdmin, sections })}
          >
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
