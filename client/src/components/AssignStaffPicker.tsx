import { toast } from "sonner";
import { UserCheck, UserPlus, BellOff } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
import { splitCalendarStaff } from "@shared/calendarStaffSelection";

/**
 * Hand a voicemail or a message to someone on the floor.
 *
 * Reads the operational staff directory rather than taking a list as a prop,
 * so the two call sites cannot drift apart on who is assignable.
 *
 * It says out loud when the person it is about to assign has no login. Four
 * of the bathing team have none, and for them an assignment is a note on a
 * row that they will never be shown — which looks identical to a working
 * handover until a dog is not rung back about. Assigning them is still
 * allowed; it just does not pretend a bell will ring.
 */
export function AssignStaffPicker({
  kind,
  id,
  assignedStaffId,
  assignedStaffName,
  onAssigned,
}: {
  kind: "message" | "missed_call";
  id: number;
  assignedStaffId: number | null | undefined;
  assignedStaffName: string | null | undefined;
  onAssigned?: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: staffList } = trpc.staff.listOperational.useQuery({});
  const assign = trpc.sms.assignNotification.useMutation({
    onSuccess: () => {
      utils.sms.myAssignments.invalidate();
      utils.sms.getMissedCalls.invalidate();
      utils.sms.getThreads.invalidate();
      onAssigned?.();
    },
    // A silent failure here reads as "assigned" and is the failure mode that
    // actually costs a callback.
    onError: (error) => toast.error(error.message || "Could not assign that"),
  });

  // Same grooming/bathing split the diary uses, so one directory, one order.
  const { groomers, bathers } = splitCalendarStaff(
    (staffList ?? []).filter((member) => member.isActive !== false),
  );

  const row = (member: (typeof groomers)[number]) => {
    const selected = member.id === assignedStaffId;
    const reachable = (member as { hasLogin?: boolean }).hasLogin !== false;
    return (
      <button
        key={member.id}
        type="button"
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${selected ? "bg-accent" : ""}`}
        onClick={() => assign.mutate({ kind, id, staffId: selected ? null : member.id })}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: member.colourHex ?? "#6366f1" }}
        />
        <span className="min-w-0 flex-1 truncate">{member.name}</span>
        {!reachable && (
          <span title="No login — they will not get a notification">
            <BellOff className="h-3 w-3 shrink-0 text-muted-foreground" />
          </span>
        )}
        {selected && <UserCheck className="h-3.5 w-3.5 shrink-0 text-primary" />}
      </button>
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-accent ${
            assignedStaffId ? "border-violet-300 text-violet-700 dark:border-violet-800 dark:text-violet-300" : "text-muted-foreground"
          }`}
          title={assignedStaffName ? `Assigned to ${assignedStaffName}` : "Assign to a staff member"}
          onClick={(e) => e.stopPropagation()}
        >
          {assignedStaffId ? <UserCheck className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}
          {assignedStaffName ?? "Assign"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="end" onClick={(e) => e.stopPropagation()}>
        <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Assign to
        </p>
        {assignedStaffId && (
          <button
            type="button"
            className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
            onClick={() => assign.mutate({ kind, id, staffId: null })}
          >
            Unassign
          </button>
        )}
        {groomers.length > 0 && (
          <p className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">
            Groomers
          </p>
        )}
        {groomers.map(row)}
        {bathers.length > 0 && (
          <p className="px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">
            Bathing team
          </p>
        )}
        {bathers.map(row)}
      </PopoverContent>
    </Popover>
  );
}
