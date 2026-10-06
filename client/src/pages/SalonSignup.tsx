import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import {
  slugifySalonName, checkSlugShape, checkPassword,
  SLUG_PROBLEM_MESSAGES, PASSWORD_PROBLEM_MESSAGES, MIN_PASSWORD_LENGTH,
} from "@shared/salonSignup";
import { normaliseCode, isCompleteCode, CODE_LENGTH, CODE_TTL_MINUTES } from "@shared/signupVerification";

/**
 * Starting a salon on Groomigo.
 *
 * One page, not a wizard. A wizard is right when later steps depend on
 * earlier answers; here nothing does, and four screens to collect five
 * fields is just four chances to abandon.
 *
 * No payment. A salon lands on a trial with everything, and the card
 * happens later when there is something to judge — signing up should not
 * require deciding what Groomigo is worth before seeing it.
 */
export default function SalonSignup() {
  const [, navigate] = useLocation();
  const [salonName, setSalonName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [touchedPassword, setTouchedPassword] = useState(false);

  // The address has to be proved before anything is created, so the page
  // has two moments rather than two screens: everything entered stays on
  // screen behind the code box.
  const [codeSent, setCodeSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [code, setCode] = useState("");

  const localSlug = useMemo(() => slugifySalonName(salonName), [salonName]);
  const slugShape = localSlug ? checkSlugShape(localSlug) : null;

  // Only ask the server once the name is plausible — a request per
  // keystroke on a half-typed name tells nobody anything.
  const { data: slugCheck, isFetching: checkingSlug } = trpc.salonSignup.previewSlug.useQuery(
    { salonName },
    { enabled: salonName.trim().length > 1 && !slugShape, staleTime: 10_000 },
  );

  const passwordProblem = touchedPassword && password ? checkPassword(password) : null;

  const requestCode = trpc.salonSignup.requestCode.useMutation({
    onSuccess: () => { setCodeSent(true); toast.success("Code sent", { description: `Check ${email} — it lasts ${CODE_TTL_MINUTES} minutes.` }); },
    onError: (e) => toast.error("Could not send the code", { description: e.message }),
  });
  const verifyCode = trpc.salonSignup.verifyCode.useMutation({
    onSuccess: () => { setEmailVerified(true); toast.success("Email confirmed"); },
    onError: (e) => toast.error(e.message),
  });

  const create = trpc.salonSignup.create.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.salonName} is set up`, { description: "You are signed in — have a look around." });
      // Hard navigation, not a client-side route change: the session
      // cookie was only just set, and every query on the next page needs
      // the request that carries it.
      window.location.href = "/";
    },
    onError: (e) => toast.error("Could not create the salon", { description: e.message }),
  });

  const effectiveSlug = slugCheck?.slug ?? localSlug;
  const canSubmit = Boolean(
    salonName.trim() && ownerName.trim() && email.trim() && password &&
    !slugShape && !checkPassword(password) && emailVerified && !create.isPending,
  );

  // Never leave somebody staring at a form that silently will not submit.
  const blocker =
    !salonName.trim() ? "Your salon needs a name." :
    slugShape ? SLUG_PROBLEM_MESSAGES[slugShape] :
    !ownerName.trim() ? "We need your name." :
    !email.trim() ? "We need an email to sign you in with." :
    !password ? "Choose a password." :
    checkPassword(password) ? PASSWORD_PROBLEM_MESSAGES[checkPassword(password)!] :
    !emailVerified ? "Confirm your email address to finish." :
    null;

  useEffect(() => { document.title = "Start a salon — Groomigo"; }, []);

  return (
    <div className="min-h-dvh bg-muted/30">
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 py-10">

        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Start your salon on Groomigo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Fourteen days with everything switched on, including the workflow board. No card, and nothing
            to cancel if you decide against it.
          </p>
        </div>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            create.mutate({ salonName: salonName.trim(), ownerName: ownerName.trim(), email: email.trim(), password, phone: phone.trim() || undefined });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="salon">Salon name</Label>
            <Input id="salon" autoFocus value={salonName} onChange={(e) => setSalonName(e.target.value)} placeholder="Paws &amp; Whiskers" autoComplete="organization" />
            {localSlug && !slugShape && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {checkingSlug
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Check className="h-3 w-3 text-emerald-600" />}
                <span>
                  Your clients will book at <strong className="font-semibold text-foreground">{effectiveSlug}.groomigo.com</strong>
                  {slugCheck && !slugCheck.available && " — the plain one was taken, so we added a number"}
                </span>
              </p>
            )}
            {slugShape && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" /> {SLUG_PROBLEM_MESSAGES[slugShape]}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="owner">Your name</Label>
            <Input id="owner" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Jo Harding" autoComplete="name" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <div className="flex gap-2">
              <Input
                id="email" type="email" value={email} autoComplete="email"
                placeholder="jo@pawsandwhiskers.com.au"
                disabled={emailVerified}
                onChange={(e) => {
                  setEmail(e.target.value);
                  // Changing the address undoes the proof — it was proof
                  // of the OLD one.
                  setCodeSent(false); setEmailVerified(false); setCode("");
                }}
              />
              {!emailVerified && (
                <Button
                  type="button" variant="outline" className="shrink-0"
                  disabled={!email.trim() || requestCode.isPending}
                  onClick={() => requestCode.mutate({ email: email.trim() })}
                >
                  {requestCode.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  {codeSent ? "Resend" : "Send code"}
                </Button>
              )}
            </div>

            {emailVerified ? (
              <p className="flex items-center gap-1.5 text-xs text-emerald-600">
                <Check className="h-3 w-3" /> Confirmed. This is what you will sign in with.
              </p>
            ) : codeSent ? (
              <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
                <Label htmlFor="code" className="text-xs">Enter the {CODE_LENGTH}-digit code we sent</Label>
                <div className="flex gap-2">
                  <Input
                    id="code" inputMode="numeric" autoComplete="one-time-code"
                    className="font-mono tracking-[0.3em]" placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(normaliseCode(e.target.value))}
                  />
                  <Button
                    type="button" className="shrink-0"
                    disabled={!isCompleteCode(code) || verifyCode.isPending}
                    onClick={() => verifyCode.mutate({ email: email.trim(), code })}
                  >
                    {verifyCode.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    Confirm
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  It lasts {CODE_TTL_MINUTES} minutes. Nothing has been created yet.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                This is what you will sign in with. We will send a code to check it works.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password" type="password" value={password} autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)} onBlur={() => setTouchedPassword(true)}
            />
            {passwordProblem ? (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" /> {PASSWORD_PROBLEM_MESSAGES[passwordProblem]}
              </p>
            ) : (
              // Length, not symbols. Symbol rules push people to Passw0rd!
              // and a sticky note on the monitor.
              <p className="text-xs text-muted-foreground">
                At least {MIN_PASSWORD_LENGTH} characters. A few words you will remember beats something clever.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Salon phone <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07 3000 0000" autoComplete="tel" />
          </div>

          <div className="pt-1">
            <Button type="submit" className="w-full" disabled={!canSubmit}>
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {create.isPending ? "Setting up your salon…" : "Create my salon"}
            </Button>
            {blocker && !create.isPending && (
              <p className="mt-2 text-center text-xs text-muted-foreground">{blocker}</p>
            )}
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Already have a salon?{" "}
          <button type="button" className="font-semibold text-primary hover:underline" onClick={() => navigate("/login")}>
            Sign in
          </button>
        </p>

        <div className="mt-auto pt-10 text-center text-xs text-muted-foreground">
          Your clients&rsquo; details are yours. You can export the lot whenever you want, and nobody at
          another salon can ever see them.
        </div>

      </div>
    </div>
  );
}
