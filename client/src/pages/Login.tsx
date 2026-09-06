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

  const slideStyle = (delayMs: number): React.CSSProperties => ({
    transition: `opacity 0.7s ease ${delayMs}ms, transform 0.7s cubic-bezier(0.23,1,0.32,1) ${delayMs}ms`,
    opacity: mounted ? 1 : 0,
    transform: mounted ? "translateY(0)" : "translateY(28px)",
  });

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #0a0f1e 0%, #0d1f2d 40%, #0a1a1a 70%, #061212 100%)",
      }}
    >
      {/* Animated background grid */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(rgba(0,255,200,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,200,0.5) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Ambient glow blobs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-10 blur-3xl pointer-events-none" style={{ background: "radial-gradient(circle, #00ffcc 0%, transparent 70%)" }} />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full opacity-[0.08] blur-3xl pointer-events-none" style={{ background: "radial-gradient(circle, #00ccff 0%, transparent 70%)" }} />

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
                ? "drop-shadow(0 0 12px #00ffcc) drop-shadow(0 0 30px #00ffcc88) drop-shadow(0 0 60px #00ffcc44) brightness(1.15)"
                : "drop-shadow(0 2px 8px rgba(0,255,200,0.15)) brightness(1)",
            }}
          >
            <img src="/groomigo_logo.png" alt="Groomigo" style={{ height: "80px", width: "auto" }} />
          </div>
          <p className="mt-3 text-sm font-medium tracking-widest uppercase" style={{ color: "#00ffcc88", letterSpacing: "0.2em" }}>
            Grooming Salon Operating System
          </p>
        </div>

        {/* Login card — fade+slide-up with 150ms delay */}
        <div
          style={{
            ...slideStyle(150),
            background: "rgba(255,255,255,0.04)",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(0,255,200,0.12)",
            boxShadow: "0 25px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
            borderRadius: "1rem",
            padding: "2rem",
          }}
        >
          <h2 className="text-xl font-semibold text-white mb-1">Sign in</h2>
          <p className="text-sm mb-6" style={{ color: "#94a3b8" }}>Enter your credentials to access the dashboard</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm" style={{ color: "#cbd5e1" }}>Email address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="text-white placeholder:text-slate-500"
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                style={{
                  background: "rgba(255,255,255,0.07)",
                  border: emailFocused ? "1px solid rgba(0,255,200,0.7)" : "1px solid rgba(0,255,200,0.18)",
                  boxShadow: emailFocused ? "0 0 0 3px rgba(0,255,200,0.12), 0 0 16px rgba(0,255,200,0.08)" : "none",
                  transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                  outline: "none",
                }}
                disabled={loginMutation.isPending}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm" style={{ color: "#cbd5e1" }}>Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="text-white placeholder:text-slate-500 pr-10"
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  style={{
                    background: "rgba(255,255,255,0.07)",
                    border: passwordFocused ? "1px solid rgba(0,255,200,0.7)" : "1px solid rgba(0,255,200,0.18)",
                    boxShadow: passwordFocused ? "0 0 0 3px rgba(0,255,200,0.12), 0 0 16px rgba(0,255,200,0.08)" : "none",
                    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                    outline: "none",
                  }}
                  disabled={loginMutation.isPending}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "#64748b" }}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full font-semibold py-2.5 rounded-xl text-white transition-all duration-200 active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #00c9a7 0%, #00a896 50%, #008f7a 100%)", boxShadow: "0 4px 20px rgba(0,201,167,0.35)" }}
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
                    background: rememberMe ? "#00c9a7" : "rgba(255,255,255,0.07)",
                    border: rememberMe ? "1px solid #00c9a7" : "1px solid rgba(0,255,200,0.3)",
                    boxShadow: rememberMe ? "0 0 8px rgba(0,201,167,0.4)" : "none",
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
                style={{ color: rememberMe ? "#94a3b8" : "#64748b" }}
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
              style={{ color: "#00ffcc66" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#00ffcc")}
              onMouseLeave={e => (e.currentTarget.style.color = "#00ffcc66")}
            >
              Forgot password?
            </button>
          </div>

          <p className="text-center text-xs mt-4" style={{ color: "#475569" }}>
            Barkin Beautiful Grooming Studio &amp; Playgroup
          </p>

          {/* Divider */}
          <div className="flex items-center gap-3 mt-5">
            <div className="flex-1 h-px" style={{ background: "rgba(0,255,200,0.1)" }} />
            <span className="text-xs" style={{ color: "#475569" }}>or</span>
            <div className="flex-1 h-px" style={{ background: "rgba(0,255,200,0.1)" }} />
          </div>

          {/* Sign in with Google */}
          <button
            type="button"
            onClick={() => startLogin()}
            className="w-full mt-4 flex items-center justify-center gap-3 rounded-xl py-2.5 font-medium text-sm transition-all duration-200 active:scale-[0.98]"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(0,255,200,0.2)",
              color: "#e2e8f0",
              boxShadow: "0 0 0 0 rgba(0,255,200,0)",
              transition: "border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,255,200,0.6)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 16px rgba(0,255,200,0.15), 0 0 0 1px rgba(0,255,200,0.2)";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,255,200,0.06)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,255,200,0.2)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
            }}
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>
        </div>

        {/* Slogan footer — fade+slide-up with 300ms delay */}
        <div className="text-center mt-10 space-y-1" style={slideStyle(300)}>
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#00ffcc55", letterSpacing: "0.25em" }}>
            Powered by Groomigo
          </p>
          <p className="text-sm italic" style={{ color: "#64748b" }}>
            'Your grooming salon's best mate...well, amigo.'
          </p>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {forgotOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) setForgotOpen(false); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 relative"
            style={{
              background: "rgba(13,31,45,0.97)",
              border: "1px solid rgba(0,255,200,0.18)",
              boxShadow: "0 25px 50px rgba(0,0,0,0.6)",
              animation: "slideUp 0.3s cubic-bezier(0.23,1,0.32,1)",
            }}
          >
            <button
              onClick={() => setForgotOpen(false)}
              className="absolute top-4 right-4 transition-colors"
              style={{ color: "#64748b" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
              onMouseLeave={e => (e.currentTarget.style.color = "#64748b")}
            >
              <X className="w-4 h-4" />
            </button>

            {forgotSent ? (
              <div className="text-center py-4">
                <div className="text-4xl mb-3">📬</div>
                <h3 className="text-lg font-semibold text-white mb-2">Check your inbox</h3>
                <p className="text-sm" style={{ color: "#94a3b8" }}>
                  If an account exists for <strong className="text-white">{forgotEmail}</strong>, a password reset link has been sent.
                </p>
                <button
                  onClick={() => setForgotOpen(false)}
                  className="mt-5 text-sm font-medium transition-colors"
                  style={{ color: "#00c9a7" }}
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-white mb-1">Reset your password</h3>
                <p className="text-sm mb-5" style={{ color: "#94a3b8" }}>
                  Enter your email address and we'll send you a reset link.
                </p>
                <form onSubmit={handleForgot} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="forgot-email" className="text-sm" style={{ color: "#cbd5e1" }}>Email address</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="text-white placeholder:text-slate-500"
                      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(0,255,200,0.18)" }}
                      disabled={resetMutation.isPending}
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full font-semibold text-white rounded-xl"
                    style={{ background: "linear-gradient(135deg, #00c9a7 0%, #008f7a 100%)", boxShadow: "0 4px 16px rgba(0,201,167,0.3)" }}
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
import { startLogin } from "@/const";
