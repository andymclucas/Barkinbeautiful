import { FormEvent, useState } from "react";
import { useLocation, useParams } from "wouter";
import { ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ClientPortalSetup() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { data, isLoading, error } = trpc.clientPortal.getSetup.useQuery({ token: token ?? "" }, { enabled: Boolean(token) });
  const completeSetup = trpc.clientPortal.completeSetup.useMutation({ onSuccess: () => navigate("/portal") });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmPassword) return;
    completeSetup.mutate({ token: token ?? "", password });
  };

  if (isLoading) return <main className="grid min-h-screen place-items-center bg-gradient-to-br from-pink-50 via-background to-teal-50 p-6"><Card className="w-full max-w-md"><CardContent className="p-6 text-sm text-muted-foreground">Checking your setup link…</CardContent></Card></main>;
  if (error || !data) return <main className="grid min-h-screen place-items-center bg-gradient-to-br from-pink-50 via-background to-teal-50 p-6"><Card className="w-full max-w-md text-center"><CardHeader><ShieldCheck className="mx-auto h-9 w-9 text-primary" /><CardTitle>Setup link unavailable</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{error?.message ?? "Please ask the salon for a new client portal setup link."}</p></CardContent></Card></main>;

  const passwordsMatch = password === confirmPassword;

  return <main className="min-h-screen bg-gradient-to-br from-pink-50 via-background to-teal-50 px-4 py-10">
    <Card className="mx-auto w-full max-w-lg border-primary/10 shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Create your client portal password</CardTitle>
        <p className="text-sm text-muted-foreground">Hi {data.client.firstName}, this secure setup link is for {data.salon.name}. It does not create staff or administrator access.</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-3 text-sm"><span className="font-medium">Login email:</span> {data.client.email}</div>
          <div className="space-y-2"><Label htmlFor="new-client-password">Password</Label><Input id="new-client-password" type="password" value={password} onChange={event => setPassword(event.target.value)} minLength={8} autoComplete="new-password" required /></div>
          <div className="space-y-2"><Label htmlFor="confirm-client-password">Confirm password</Label><Input id="confirm-client-password" type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} minLength={8} autoComplete="new-password" required /></div>
          {!passwordsMatch && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">Passwords do not match.</p>}
          {completeSetup.error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{completeSetup.error.message}</p>}
          <Button type="submit" className="w-full" disabled={!passwordsMatch || password.length < 8 || completeSetup.isPending}>{completeSetup.isPending ? "Creating account…" : "Create portal account"}</Button>
        </form>
      </CardContent>
    </Card>
  </main>;
}
