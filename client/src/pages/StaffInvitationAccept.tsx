import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Clock3, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useRoute } from "wouter";
import { toast } from "sonner";

export default function StaffInvitationAccept() {
  const [, params] = useRoute("/staff-invite/:token");
  const token = params?.token ?? "";
  const invitation = trpc.staff.getInvitation.useQuery({ token }, { enabled: token.length === 64 });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [complete, setComplete] = useState(false);
  const accept = trpc.staff.acceptInvitation.useMutation({
    onSuccess: () => setComplete(true),
    onError: (error) => toast.error(error.message),
  });

  const unavailable = !token || invitation.data === null || invitation.data?.expired || invitation.data?.status !== "pending";

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#fff7fb] via-white to-teal-50 px-4 py-10 sm:py-16">
      <section className="mx-auto w-full max-w-md rounded-3xl border border-rose-100 bg-white p-6 shadow-xl shadow-rose-100/50 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-700 text-white"><ShieldCheck className="h-6 w-6" /></div>
          <div><p className="text-sm font-semibold text-teal-700">Groomigo staff access</p><h1 className="text-xl font-bold text-slate-900">Set up your account</h1></div>
        </div>

        {invitation.isLoading ? <div className="space-y-3 animate-pulse"><div className="h-5 w-2/3 rounded bg-slate-100" /><div className="h-10 rounded-lg bg-slate-100" /><div className="h-10 rounded-lg bg-slate-100" /></div> : complete ? (
          <div className="space-y-4 text-center py-4"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h2 className="text-lg font-bold">Account setup complete</h2><p className="text-sm text-muted-foreground">Your administrator must approve your access before you can sign in. They will be able to see that your profile is ready.</p></div>
        ) : unavailable ? (
          <div className="space-y-3 rounded-2xl bg-rose-50 p-4"><Clock3 className="h-6 w-6 text-rose-600" /><h2 className="font-bold text-rose-950">This invitation is unavailable</h2><p className="text-sm text-rose-800">It may have expired, been replaced or already been used. Please ask your salon administrator to send a new invitation.</p></div>
        ) : (
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (password.length < 8) return toast.error("Choose a password with at least 8 characters"); if (password !== confirmPassword) return toast.error("Passwords do not match"); accept.mutate({ token, password }); }}>
            <p className="text-sm text-muted-foreground">You are accepting an invitation for <strong className="text-foreground">{invitation.data?.staffName}</strong> at <strong className="text-foreground">{invitation.data?.email}</strong>. You will be able to view your assigned appointments, update workflow stages, and upload grooming-card photos after approval.</p>
            <div><Label htmlFor="staff-password">Create password</Label><Input id="staff-password" className="mt-1" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></div>
            <div><Label htmlFor="staff-password-confirm">Confirm password</Label><Input id="staff-password-confirm" className="mt-1" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></div>
            <div className="rounded-xl bg-teal-50 p-3 text-xs text-teal-900">Your account remains inactive until the salon administrator approves it. Appointment editing and administrative areas are not included in staff access.</div>
            <Button type="submit" className="w-full" disabled={accept.isPending}>{accept.isPending ? "Setting up…" : "Complete setup"}</Button>
          </form>
        )}
      </section>
    </main>
  );
}
