"use client";
import { useState, useEffect } from "react";

type Mode = "login" | "signup" | "forgot";

// -- Supabase version -----------------------------------------------------------
async function getSupabase() {
  const { createClient } = await import("@/lib/supabase");
  return createClient();
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const hasSupabase = SUPABASE_URL.length > 0 && !SUPABASE_URL.includes("placeholder");

export function AuthPage({ onAuth }: { onAuth: () => void }) {
  const [mode,    setMode]    = useState<Mode>("login");
  const [email,   setEmail]   = useState("");
  const [pass,    setPass]    = useState("");
  const [confirm, setConfirm] = useState("");
  const [error,   setError]   = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Listen for Supabase auth state change
  useEffect(() => {
    if (!hasSupabase) return;
    let unsub: (() => void) | null = null;
    getSupabase().then(sb => {
      const { data: { subscription } } = sb.auth.onAuthStateChange((_e, session) => {
        if (session?.user) onAuth();
      });
      unsub = () => subscription.unsubscribe();
    });
    return () => { unsub?.(); };
  }, [onAuth]);

  const submit = async () => {
    setError(""); setMessage(""); setLoading(true);

    if (hasSupabase) {
      // -- Supabase auth -------------------------------------------------------
      try {
        const sb = await getSupabase();
        if (mode === "signup") {
          if (pass !== confirm) { setError("Passwords don't match"); setLoading(false); return; }
          if (pass.length < 6)  { setError("Password must be at least 6 characters"); setLoading(false); return; }
          const { data: d, error: e } = await sb.auth.signUp({ email, password: pass });
          if (e) { setError(e.message); setLoading(false); return; }
          // If the Supabase project requires email confirmation, signUp
          // succeeds but returns no session — nothing else happens on its
          // own, so tell the user to check their inbox instead of leaving
          // them staring at an unresponsive button.
          if (!d.session) {
            setMessage("Account created — check your email to confirm before signing in.");
            setMode("login");
            setLoading(false);
            return;
          }
          // Otherwise onAuthStateChange fires automatically
        } else if (mode === "login") {
          const { error: e } = await sb.auth.signInWithPassword({ email, password: pass });
          if (e) { setError(e.message); setLoading(false); return; }
          // onAuthStateChange fires automatically
        } else {
          const { error: e } = await sb.auth.resetPasswordForEmail(email);
          if (e) { setError(e.message); setLoading(false); return; }
          setMessage("Reset link sent — check your inbox.");
          setMode("login");
        }
      } catch (e: any) {
        setError(e.message || "Something went wrong");
      }
    } else {
      // Supabase isn't configured — there used to be a localStorage fallback
      // here that stored raw passwords client-side with no real verification
      // (anyone with devtools access could read every password or forge a
      // session). That's not a tradeoff worth making even as a dev fallback,
      // so this state is a dead end: the form below is replaced with a
      // config-error screen and never actually renders the button that calls
      // submit(). This branch only exists so submit() can't silently no-op.
      setError("This app isn't configured yet — sign-in is unavailable.");
    }

    setLoading(false);
  };

  if (!hasSupabase) {
    return (
      <div style={{ minHeight:"100vh", background:"#060a0f", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
        <div style={{ width:"100%", maxWidth:420, background:"#0d1219", border:"1px solid rgba(255,23,68,0.25)", borderRadius:22, padding:"36px 32px", textAlign:"center", boxShadow:"0 30px 70px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)" }}>
          <div style={{ fontSize:28, marginBottom:14 }}>⚠️</div>
          <div style={{ fontSize:16, fontWeight:800, color:"#f0f6fc", marginBottom:8 }}>App not configured</div>
          <div style={{ fontSize:13, color:"#8b949e", lineHeight:1.7 }}>
            <code style={{ color:"#00e5ff" }}>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code style={{ color:"#00e5ff" }}>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> aren&apos;t set for this deployment, so sign-in can&apos;t work yet.
            Add them in Vercel → Project → Settings → Environment Variables and redeploy.
          </div>
        </div>
      </div>
    );
  }

  const IS: React.CSSProperties = {
    width: "100%", height: 44,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 10, color: "#f0f6fc",
    fontSize: 14, padding: "0 14px",
    outline: "none", fontFamily: "inherit",
    boxSizing: "border-box",
  };

  return (
    <div style={{ minHeight:"100vh", background:"#060a0f", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ position:"fixed", inset:0, pointerEvents:"none", overflow:"hidden" }}>

      </div>

      <div style={{ width:"100%", maxWidth:420, background:"#0d1219", border:"1px solid rgba(255,255,255,0.09)", borderRadius:22, overflow:"hidden", boxShadow:"0 30px 70px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)", position:"relative" }}>
        <div style={{ height:2, background:"linear-gradient(90deg,transparent,#00e5ff,transparent)" }}/>

        <div style={{ padding:"36px 36px 32px" }}>
          <div style={{ textAlign:"center", marginBottom:32 }}>
            <div style={{ fontSize:28, fontWeight:900, color:"#f0f6fc", letterSpacing:"-0.04em", fontFamily:"monospace" }}>
              Trader<span style={{ color:"#00e5ff" }}>Hub</span>
            </div>
            <div style={{ fontSize:12, color:"#4b5563", marginTop:4 }}>Professional Trading Journal</div>
          </div>

          <div style={{ display:"flex", background:"rgba(255,255,255,0.04)", borderRadius:10, padding:3, marginBottom:24 }}>
            {(["login","signup"] as Mode[]).map(m => (
              <button key={m} onClick={() => { setMode(m); setError(""); setMessage(""); }} style={{
                flex:1, height:36, borderRadius:8, border:"none",
                background: mode===m ? "rgba(0,229,255,0.12)" : "transparent",
                color: mode===m ? "#00e5ff" : "#4b5563",
                fontSize:13, fontWeight:700, cursor:"pointer",
              }}>
                {m === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {mode === "forgot" && <div style={{ fontSize:13, color:"#6b7280", lineHeight:1.6 }}>Enter your email to receive a password reset link.</div>}

            <div>
              <div style={{ fontSize:10, color:"#4b5563", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>Email</div>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="you@example.com" style={IS}/>
            </div>

            {mode !== "forgot" && (
              <div>
                <div style={{ fontSize:10, color:"#4b5563", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>Password</div>
                <input type="password" value={pass} onChange={e=>setPass(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="••••••••" style={IS}
                  autoComplete={mode==="signup"?"new-password":"current-password"}/>
              </div>
            )}

            {mode === "signup" && (
              <div>
                <div style={{ fontSize:10, color:"#4b5563", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>Confirm Password</div>
                <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="••••••••" style={IS}/>
              </div>
            )}

            {error   && <div style={{ padding:"10px 14px", borderRadius:9, background:"rgba(255,23,68,0.08)",  border:"1px solid rgba(255,23,68,0.2)",  fontSize:13, color:"#f87171" }}>{error}</div>}
            {message && <div style={{ padding:"10px 14px", borderRadius:9, background:"rgba(0,230,118,0.08)", border:"1px solid rgba(0,230,118,0.2)", fontSize:13, color:"#00e676" }}>{message}</div>}

            <button onClick={submit} disabled={loading} style={{
              height:46, borderRadius:11, border:"none",
              background: loading ? "rgba(0,229,255,0.2)" : "linear-gradient(135deg,#00e5ff,#0088bb)",
              color: loading ? "#00e5ff" : "#000",
              fontSize:14, fontWeight:800, cursor: loading ? "default" : "pointer", marginTop:4,
              boxShadow: loading ? "none" : "0 0 24px rgba(0,229,255,0.25)",
              display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            }}>
              {loading
                ? <><div style={{ width:16, height:16, borderRadius:"50%", border:"2px solid rgba(0,229,255,0.3)", borderTop:"2px solid #00e5ff", animation:"spin 0.8s linear infinite" }}/> Loading...</>
                : mode==="login" ? "Sign In →" : mode==="signup" ? "Create Account →" : "Send Reset Email"
              }
            </button>

            {mode === "login" && (
              <button onClick={()=>{setMode("forgot");setError("");}} style={{ background:"none", border:"none", color:"#4b5563", fontSize:12, cursor:"pointer", marginTop:-4 }}>
                Forgot password?
              </button>
            )}
            {mode === "forgot" && (
              <button onClick={()=>setMode("login")} style={{ background:"none", border:"none", color:"#4b5563", fontSize:12, cursor:"pointer" }}>
                ← Back to sign in
              </button>
            )}
          </div>
        </div>

        <div style={{ padding:"14px 36px", borderTop:"1px solid rgba(255,255,255,0.05)", background:"rgba(0,0,0,0.2)", textAlign:"center" }}>
          <span style={{ fontSize:11, color:"#374151" }}>TraderHub · Professional Trading Journal</span>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
