import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, X } from "lucide-react";

export default function Login() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [logoHovered, setLogoHovered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    try { return localStorage.getItem("groomigo_remember") === "1"; } catch { return false; }
  });
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  // If this page was opened from a password-reset email link
  // (/login?reset=TOKEN&email=you@example.com), show a "set new password"
  // form instead of the normal sign-in form.
  const [resetParams, setResetParams] = useState<{ token: string; email: string } | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [resetCompleted, setResetCompleted] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("reset");
    const emailParam = params.get("email");
    if (token && emailParam) {
      setResetParams({ token, email: emailParam });
    }
  }, []);

  useEffect(() => {
    // Trigger entrance animation after mount
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async (result) => {
      await utils.auth.me.invalidate();
      toast.success("Welcome back!");
      navigate(result.user.role === "admin" ? "/" : "/calendar");
    },
    onError: (err) => {
      toast.error(err.message || "Invalid email or password");
    },
  });

  const resetMutation = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => {
      setForgotSent(true);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to send reset email");
    },
  });

  const completeResetMutation = trpc.auth.completePasswordReset.useMutation({
    onSuccess: () => {
      setResetCompleted(true);
      toast.success("Password updated \u2014 you can sign in now");
    },
    onError: (err) => {
      toast.error(err.message || "This reset link is invalid or has expired.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter your email and password");
      return;
    }
    try { localStorage.setItem("groomigo_remember", rememberMe ? "1" : "0"); } catch {}
    loginMutation.mutate({ email, password, rememberMe });
  };

  const handleForgot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) { toast.error("Please enter your email address"); return; }
    resetMutation.mutate({ email: forgotEmail });
  };

  const handleCompleteReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetParams) return;
    if (resetPasswordValue.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (resetPasswordValue !== resetPasswordConfirm) { toast.error("Passwords don't match"); return; }
    completeResetMutation.mutate({ email: resetParams.email, token: resetParams.token, newPassword: resetPasswordValue });
  };

  const finishResetAndSignIn = () => {
    if (resetParams) setEmail(resetParams.email);
    setResetParams(null);
    // Clean the reset params out of the URL so refreshing doesn't re-show this form.
    window.history.replaceState({}, "", "/login");
  };


  const slideStyle = (delayMs: number): React.CSSProperties => ({
    transition: `opacity 0.7s ease ${delayMs}ms, transform 0.7s cubic-bezier(0.23,1,0.32,1) ${delayMs}ms`,
    opacity: mounted ? 1 : 0,
    transform: mounted ? "translateY(0)" : "translateY(28px)",
  });

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden"
      style={{
        background: "linear-gradient(160deg, #faf8ff 0%, #f4f0fe 45%, #f7f4ff 75%, #fdfcff 100%)",
      }}
    >
      {/* Animated background grid */}
      <div
        className="absolute inset-0 opacity-[0.055]"
        style={{
          backgroundImage: `linear-gradient(rgba(124,58,237,0.30) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.30) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Ambient glow blobs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-10 blur-3xl pointer-events-none" style={{ background: "radial-gradient(circle, #a78bfa 0%, transparent 70%)" }} />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full opacity-[0.08] blur-3xl pointer-events-none" style={{ background: "radial-gradient(circle, #f0abfc 0%, transparent 70%)" }} />

      <div className="relative w-full max-w-md z-10">

        {/* Groomigo Logo — fade+slide-up with neon hover */}
        <div className="text-center mb-8" style={slideStyle(0)}>
          <div
            className="inline-block cursor-pointer select-none"
            onMouseEnter={() => setLogoHovered(true)}
            onMouseLeave={() => setLogoHovered(false)}
            style={{
              transition: "transform 0.35s cubic-bezier(0.23,1,0.32,1), filter 0.35s ease",
              transform: logoHovered ? "scale(1.12)" : "scale(1)",
              filter: logoHovered
                ? "drop-shadow(0 0 12px #7c3aed) drop-shadow(0 0 30px #7c3aedaa) drop-shadow(0 0 60px #7c3aed44) brightness(1.15)"
                : "drop-shadow(0 2px 8px rgba(124,58,237,0.14)) brightness(1)",
            }}
          >
            <img src="/groomigo_logo.png" alt="Groomigo" style={{ height: "80px", width: "auto" }} />
          </div>
          <p className="mt-3 text-sm font-medium tracking-widest uppercase" style={{ color: "#7c3aedaa", letterSpacing: "0.2em" }}>
            Grooming Salon Operating System
          </p>
        </div>

        {/* Login card — fade+slide-up with 150ms delay */}
        <div
          style={{
            ...slideStyle(150),
            background: "#ffffff",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(124,58,237,0.12)",
            boxShadow: "0 24px 48px -20px rgba(76,29,149,0.18), inset 0 1px 0 rgba(124,58,237,0.06)",
            borderRadius: "1rem",
            padding: "2rem",
          }}
        >
          {resetParams ? (
            resetCompleted ? (
              <div className="text-center py-4">
                <div className="text-4xl mb-3">✅</div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Password updated</h3>
                <p className="text-sm mb-5" style={{ color: "#6b7280" }}>
                  Your password has been changed. You can sign in with it now.
                </p>
                <Button
                  onClick={finishResetAndSignIn}
                  className="w-full font-semibold text-white rounded-xl"
                  style={{ background: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)", boxShadow: "0 4px 16px rgba(124,58,237,0.26)" }}
                >
                  Continue to sign in
                </Button>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-semibold text-foreground mb-1">Set a new password</h2>
                <p className="text-sm mb-6" style={{ color: "#6b7280" }}>
                  Choose a new password for <strong className="text-foreground">{resetParams.email}</strong>
                </p>
                <form onSubmit={handleCompleteReset} className="space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="reset-password" className="text-sm" style={{ color: "#4b5563" }}>New password</Label>
                    <div className="relative">
                      <Input
                        id="reset-password"
                        type={showResetPassword ? "text" : "password"}
                        value={resetPasswordValue}
                        onChange={(e) => setResetPasswordValue(e.target.value)}
                        placeholder="At least 8 characters"
                        autoComplete="new-password"
                        className="text-foreground placeholder:text-muted-foreground pr-10"
                        style={{ background: "#ffffff", border: "1px solid rgba(124,58,237,0.16)" }}
                        disabled={completeResetMutation.isPending}
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetPassword(!showResetPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                        style={{ color: "#9ca3af" }}
                      >
                        {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reset-password-confirm" className="text-sm" style={{ color: "#4b5563" }}>Confirm new password</Label>
                    <Input
                      id="reset-password-confirm"
                      type={showResetPassword ? "text" : "password"}
                      value={resetPasswordConfirm}
                      onChange={(e) => setResetPasswordConfirm(e.target.value)}
                      placeholder="Re-enter your new password"
                      autoComplete="new-password"
                      className="text-foreground placeholder:text-muted-foreground"
                      style={{ background: "#ffffff", border: "1px solid rgba(124,58,237,0.16)" }}
                      disabled={completeResetMutation.isPending}
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full font-semibold py-2.5 rounded-xl text-white transition-all duration-200 active:scale-[0.98]"
                    style={{ background: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #6d28d9 100%)", boxShadow: "0 4px 20px rgba(124,58,237,0.30)" }}
                    disabled={completeResetMutation.isPending}
                  >
                    {completeResetMutation.isPending ? (
                      <span className="flex items-center gap-2 justify-center">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Saving...
                      </span>
                    ) : "Set new password"}
                  </Button>
                </form>
              </>
            )
          ) : (
          <>
          <h2 className="text-xl font-semibold text-foreground mb-1">Sign in</h2>
          <p className="text-sm mb-6" style={{ color: "#6b7280" }}>Enter your credentials to access the dashboard</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm" style={{ color: "#4b5563" }}>Email address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="text-foreground placeholder:text-muted-foreground"
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                style={{
                  background: "#ffffff",
                  border: emailFocused ? "1px solid rgba(124,58,237,0.55)" : "1px solid rgba(124,58,237,0.16)",
                  boxShadow: emailFocused ? "0 0 0 3px rgba(124,58,237,0.12), 0 0 16px rgba(124,58,237,0.07)" : "none",
                  transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                  outline: "none",
                }}
                disabled={loginMutation.isPending}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm" style={{ color: "#4b5563" }}>Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="text-foreground placeholder:text-muted-foreground pr-10"
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  style={{
                    background: "#ffffff",
                    border: passwordFocused ? "1px solid rgba(124,58,237,0.55)" : "1px solid rgba(124,58,237,0.16)",
                    boxShadow: passwordFocused ? "0 0 0 3px rgba(124,58,237,0.12), 0 0 16px rgba(124,58,237,0.07)" : "none",
                    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                    outline: "none",
                  }}
                  disabled={loginMutation.isPending}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "#9ca3af" }}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full font-semibold py-2.5 rounded-xl text-white transition-all duration-200 active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #6d28d9 100%)", boxShadow: "0 4px 20px rgba(124,58,237,0.30)" }}
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? (
                <span className="flex items-center gap-2 justify-center">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : "Sign in"}
            </Button>

            {/* Remember Me */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none group">
              <div
                className="relative flex-shrink-0"
                onClick={() => setRememberMe(v => !v)}
              >
                <div
                  className="w-4 h-4 rounded border transition-all"
                  style={{
                    background: rememberMe ? "#7c3aed" : "#ffffff",
                    border: rememberMe ? "1px solid #7c3aed" : "1px solid rgba(124,58,237,0.28)",
                    boxShadow: rememberMe ? "0 0 8px rgba(124,58,237,0.34)" : "none",
                  }}
                >
                  {rememberMe && (
                    <svg className="absolute inset-0 m-auto w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                    </svg>
                  )}
                </div>
              </div>
              <span
                className="text-xs transition-colors"
                style={{ color: rememberMe ? "#6b7280" : "#9ca3af" }}
                onClick={() => setRememberMe(v => !v)}
              >
                Remember me for 30 days
              </span>
            </label>
          </form>

          {/* Forgot password link */}
          <div className="text-center mt-4">
            <button
              type="button"
              onClick={() => { setForgotOpen(true); setForgotEmail(email); setForgotSent(false); }}
              className="text-xs transition-colors hover:underline"
              style={{ color: "#7c3aed80" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#7c3aed")}
              onMouseLeave={e => (e.currentTarget.style.color = "#7c3aed80")}
            >
              Forgot password?
            </button>
          </div>

          <p className="text-center text-xs mt-4" style={{ color: "#6b7280" }}>
            Barkin Beautiful Grooming Studio &amp; Playgroup
          </p>
          </>
          )}

        </div>

        {/* Slogan footer — fade+slide-up with 300ms delay */}
        <div className="text-center mt-10 space-y-1" style={slideStyle(300)}>
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#7c3aed66", letterSpacing: "0.25em" }}>
            Powered by Groomigo
          </p>
          <p className="text-sm italic" style={{ color: "#9ca3af" }}>
            'Your grooming salon's best mate...well, amigo.'
          </p>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {forgotOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(76,29,149,0.16)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) setForgotOpen(false); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 relative"
            style={{
              background: "#ffffff",
              border: "1px solid rgba(124,58,237,0.16)",
              boxShadow: "0 25px 50px rgba(76,29,149,0.14)",
              animation: "slideUp 0.3s cubic-bezier(0.23,1,0.32,1)",
            }}
          >
            <button
              onClick={() => setForgotOpen(false)}
              className="absolute top-4 right-4 transition-colors"
              style={{ color: "#9ca3af" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
              onMouseLeave={e => (e.currentTarget.style.color = "#9ca3af")}
            >
              <X className="w-4 h-4" />
            </button>

            {forgotSent ? (
              <div className="text-center py-4">
                <div className="text-4xl mb-3">📬</div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Check your inbox</h3>
                <p className="text-sm" style={{ color: "#6b7280" }}>
                  If an account exists for <strong className="text-foreground">{forgotEmail}</strong>, a password reset link has been sent.
                </p>
                <button
                  onClick={() => setForgotOpen(false)}
                  className="mt-5 text-sm font-medium transition-colors"
                  style={{ color: "#7c3aed" }}
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-foreground mb-1">Reset your password</h3>
                <p className="text-sm mb-5" style={{ color: "#6b7280" }}>
                  Enter your email address and we'll send you a reset link.
                </p>
                <form onSubmit={handleForgot} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="forgot-email" className="text-sm" style={{ color: "#4b5563" }}>Email address</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="text-foreground placeholder:text-muted-foreground"
                      style={{ background: "#ffffff", border: "1px solid rgba(124,58,237,0.16)" }}
                      disabled={resetMutation.isPending}
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full font-semibold text-white rounded-xl"
                    style={{ background: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)", boxShadow: "0 4px 16px rgba(124,58,237,0.26)" }}
                    disabled={resetMutation.isPending}
                  >
                    {resetMutation.isPending ? (
                      <span className="flex items-center gap-2 justify-center">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Sending...
                      </span>
                    ) : "Send reset link"}
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
