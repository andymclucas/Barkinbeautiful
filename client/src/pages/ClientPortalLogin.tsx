import { FormEvent, useState } from "react";
import { useLocation } from "wouter";
import { LockKeyhole, Mail, PawPrint } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ClientPortalLogin() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = trpc.clientPortal.login.useMutation({
    onSuccess: () => navigate("/portal"),
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    login.mutate({ email, password });
  };

  return <main className="min-h-screen bg-gradient-to-br from-pink-50 via-background to-teal-50 px-4 py-10">
    <section className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[1.05fr_0.95fr] md:items-center">
      <div className="space-y-5 rounded-3xl bg-primary p-8 text-primary-foreground shadow-sm">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><PawPrint className="h-6 w-6" /></div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] opacity-80">Client portal</p>
          <h1 className="mt-3 font-display text-4xl font-bold leading-tight">Your pet care details, in one secure place.</h1>
        </div>
        <p className="max-w-xl text-sm leading-6 opacity-90">Sign in after the salon has created your client portal account. This area is separate from staff and administrator access.</p>
      </div>
      <Card className="border-primary/10 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl"><LockKeyhole className="h-5 w-5 text-primary" /> Client sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="client-email">Email</Label><div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="client-email" className="pl-9" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required /></div></div>
            <div className="space-y-2"><Label htmlFor="client-password">Password</Label><Input id="client-password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required /></div>
            {login.error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{login.error.message}</p>}
            <Button type="submit" className="w-full" disabled={login.isPending}>{login.isPending ? "Signing in…" : "Sign in to client portal"}</Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">Need access? Ask the salon to create a setup link for your account.</p>
        </CardContent>
      </Card>
    </section>
  </main>;
}
