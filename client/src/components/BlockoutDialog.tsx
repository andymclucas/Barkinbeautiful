import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, CalendarOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StaffAvatar from "@/components/StaffAvatar";
import { trpc } from "@/lib/trpc";
import { BLOCKOUT_REASONS, MAX_BLOCKOUT_DAYS, rangeLengthInDays } from "@shared/staffBlockouts";

/**
 * Blocking out a calendar, from a start date to an end date.
 *
 * One component for both places it is done — the Calendar's own blockout
 * button and the Staff page, where someone records their own leave — so
 * the two cannot drift into offering different rules.
 *
 * It takes a RANGE. Booking a fortnight off used to mean opening this
 * twelve times, once per day, because the table stores a row per day and
 * the form exposed that directly. It still stores a row per day; the
 * range is expanded on the server and the days share a group id so the
 * whole run can be edited or cancelled as the single decision it was.
 */

export type BlockoutEditing = {
  id: number;
  staffId: number;
  startDate: string;
  endDate: string;
  isFullDay: boolean;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
  /** Null when this day was created on its own, before ranges existed. */
  groupId: string | null;
};

type StaffOption = { id: number; name: string; colourHex?: string | null; photoUrl?: string | null };

export function BlockoutDialog({
  open, onOpenChange, staff, lockedStaffId, editing, defaultStartDate, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: StaffOption[];
  /** Set to block out one person only, with no groomer picker. */
  lockedStaffId?: number;
  /** The blockout being changed, or null to create a new one. */
  editing?: BlockoutEditing | null;
  defaultStartDate?: string;
  onSaved?: () => void;
}) {
  const isEditing = Boolean(editing);
  const [staffId, setStaffId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isFullDay, setIsFullDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [reasonChoice, setReasonChoice] = useState<string>(BLOCKOUT_REASONS[0]);
  const [otherReason, setOtherReason] = useState("");

  // Reset to whatever is being opened, every time it opens. Without this
  // the form keeps the last thing edited, and someone cancelling out of
  // one blockout and opening another silently edits it with stale values.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setStaffId(String(editing.staffId));
      setStartDate(editing.startDate);
      setEndDate(editing.endDate);
      setIsFullDay(editing.isFullDay);
      setStartTime(editing.startTime ?? "09:00");
      setEndTime(editing.endTime ?? "17:00");
      const known = BLOCKOUT_REASONS.find(r => r === editing.reason);
      setReasonChoice(known ?? "Other");
      setOtherReason(known ? "" : (editing.reason ?? ""));
    } else {
      setStaffId(lockedStaffId ? String(lockedStaffId) : "");
      setStartDate(defaultStartDate ?? "");
      setEndDate(defaultStartDate ?? "");
      setIsFullDay(true);
      setStartTime("09:00");
      setEndTime("17:00");
      setReasonChoice(BLOCKOUT_REASONS[0]);
      setOtherReason("");
    }
  }, [open, editing, lockedStaffId, defaultStartDate]);

  // Moving the start past the end is a slip, not an instruction. Carrying
  // the end along keeps a single-day blockout single-day as you change it.
  useEffect(() => {
    if (startDate && (!endDate || endDate < startDate)) setEndDate(startDate);
  }, [startDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const reason = reasonChoice === "Other" ? otherReason.trim() : reasonChoice;
  const days = startDate && endDate ? rangeLengthInDays(startDate, endDate) : 0;
  const tooLong = days > MAX_BLOCKOUT_DAYS;

  const utils = trpc.useUtils();
  const done = (message: string) => {
    toast.success(message);
    void utils.staff.listBlockouts.invalidate();
    onOpenChange(false);
    onSaved?.();
  };
  const failed = (error: { message: string }) => toast.error(error.message);

  const createMutation = trpc.staff.createBlockout.useMutation({
    onSuccess: (r) => done(
      r.alreadyBlocked > 0
        ? `Blocked out ${r.created} day${r.created === 1 ? "" : "s"} — ${r.alreadyBlocked} already blocked`
        : `Blocked out ${r.created} day${r.created === 1 ? "" : "s"}`,
    ),
    onError: failed,
  });
  const updateMutation = trpc.staff.updateBlockout.useMutation({
    onSuccess: (r) => done(`Updated — ${r.days} day${r.days === 1 ? "" : "s"} blocked out`),
    onError: failed,
  });
  const deleteMutation = trpc.staff.deleteBlockout.useMutation({
    onSuccess: (r) => done(r.removed === 1 ? "Blocked-out time removed" : `Removed ${r.removed} days`),
    onError: failed,
  });

  const saving = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const canSave = Boolean(staffId && startDate && endDate && !tooLong
    && (reasonChoice !== "Other" || otherReason.trim().length > 0));

  const chosenStaff = useMemo(() => staff.find(s => String(s.id) === staffId), [staff, staffId]);

  const save = () => {
    if (isEditing && editing) {
      updateMutation.mutate({
        tenantId: 1, id: editing.id, startDate, endDate, isFullDay,
        startTime: isFullDay ? null : startTime,
        endTime: isFullDay ? null : endTime,
        reason: reason || null,
      });
      return;
    }
    createMutation.mutate({
      tenantId: 1, staffId: parseInt(staffId), startDate, endDate, isFullDay,
      startTime: isFullDay ? undefined : startTime,
      endTime: isFullDay ? undefined : endTime,
      reason: reason || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-red-500" />
            {isEditing ? "Edit blocked-out time" : "Block out calendar"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!lockedStaffId && (
            <div className="space-y-1.5">
              <Label>Groomer <span className="text-red-500">*</span></Label>
              <Select value={staffId} onValueChange={setStaffId} disabled={isEditing}>
                <SelectTrigger><SelectValue placeholder="Select groomer..." /></SelectTrigger>
                <SelectContent>
                  {staff.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      <span className="flex items-center gap-1.5">
                        <StaffAvatar photoUrl={s.photoUrl} name={s.name} colourHex={s.colourHex} className="h-5 w-5" ring={false} />
                        {s.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isEditing && (
                <p className="text-xs text-muted-foreground">
                  To move this to someone else, remove it and block out the other groomer.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First day <span className="text-red-500">*</span></Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Last day <span className="text-red-500">*</span></Label>
              <Input type="date" min={startDate || undefined} value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          {days > 0 && (
            <p className={`text-xs ${tooLong ? "text-destructive" : "text-muted-foreground"}`}>
              {tooLong
                ? `That is ${days} days — the most that can be blocked out at once is ${MAX_BLOCKOUT_DAYS}.`
                : `${days} day${days === 1 ? "" : "s"} will be blocked out${chosenStaff ? ` for ${chosenStaff.name}` : ""}. Both dates are included.`}
            </p>
          )}

          <div className="flex items-center gap-3">
            <input
              type="checkbox" id="blockout-full-day" className="h-4 w-4 rounded border-input"
              checked={isFullDay} onChange={e => setIsFullDay(e.target.checked)}
            />
            <Label htmlFor="blockout-full-day">Full days</Label>
          </div>

          {!isFullDay && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>From</Label>
                  <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Until</Label>
                  <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
                </div>
              </div>
              {days > 1 && (
                <p className="text-xs text-muted-foreground">
                  These hours are blocked out on each of the {days} days.
                </p>
              )}
            </>
          )}

          <div className="space-y-1.5">
            <Label>Reason <span className="text-red-500">*</span></Label>
            <Select value={reasonChoice} onValueChange={setReasonChoice}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BLOCKOUT_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            {reasonChoice === "Other" && (
              <Input
                autoFocus placeholder="e.g. training, jury duty, medical"
                value={otherReason} onChange={e => setOtherReason(e.target.value)}
              />
            )}
          </div>

          <p className="flex gap-2 rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground">
            <CalendarOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Blocked-out days stop online bookings and client reschedules for that groomer. Staff can
              still book over them from the calendar when they need to.
            </span>
          </p>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {isEditing && editing ? (
            <Button
              variant="outline" disabled={saving}
              className="text-destructive hover:text-destructive"
              onClick={() => deleteMutation.mutate({ tenantId: 1, id: editing.id, wholeGroup: Boolean(editing.groupId) })}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {editing.groupId ? "Remove all days" : "Remove"}
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="bg-red-600 text-white hover:bg-red-700" disabled={!canSave || saving} onClick={save}>
              {saving ? "Saving…" : isEditing ? "Save changes" : "Block out"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BlockoutDialog;
