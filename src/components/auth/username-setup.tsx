"use client";
import { useState, useEffect } from "react";

interface Props { userId: string; onDone?: () => void; }

async function checkUsernameSupabase(username: string): Promise<boolean> {
  try {
    const { createClient } = await import("@/lib/supabase");
    const sb = createClient();
    const { data } = await sb.from("profiles").select("id").eq("username", username.toLowerCase()).maybeSingle();
    return !data; // true = available
  } catch { return true; }
}

function isUsernameTakenLocal(username: string, currentUserId: string): boolean {
  try {
    const users = JSON.parse(localStorage.getItem("th_users") || "[]");
    return users.some((u: any) => {
      const un = localStorage.getItem("th_username_" + u.id);
      return un === username && u.id !== currentUserId;
    });
  } catch { return false; }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const hasSupabase = SUPABASE_URL.length > 0 && !SUPABASE_URL.includes("placeholder");

export function UsernameSetupLocal({ userId }: { userId: string }) {
  const [username,  setUsername]  = useState("");
  const [display,   setDisplay]   = useState("");
  const [error,     setError]     = useState("");
  const [checking,  setChecking]  = useState(false);
  const [available, setAvailable] = useState<boolean|null>(null);
  const [saving,    setSaving]    = useState(false);

  // Live availability check
  useEffect(() => {
    if (username.length < 3) { setAvailable(null); return; }
    setChecking(true);
    const t = setTimeout(async () => {
      if (hasSupabase) {
        const ok = await checkUsernameSupabase(username);
        setAvailable(ok);
      } else {
        setAvailable(!isUsernameTakenLocal(username, userId));
      }
      setChecking(false);
    }, 400);
    return () => clearTimeout(t);
  }, [username, userId]);

  const save = async () => {
    if (!username.trim() || username.length < 3) { setError("Username must be at least 3 characters"); return; }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) { setError("Letters, numbers, underscores only (3-20 chars)"); return; }
    if (available === false) { setError("Username already taken — choose another"); return; }
    // Profanity check
    const { filterUsername } = await import("@/lib/profanity");
    const pf = filterUsername(username);
    if (!pf.ok) { setError(pf.reason || "Username not allowed"); return; }

    setSaving(true);
    setError("");

    const uname = username.toLowerCase();
    const dname = display || username;

    if (hasSupabase) {
      try {
        const { createClient } = await import("@/lib/supabase");
        const sb = createClient();
        const colors = ["#00e5ff","#00e676","#d500f9","#ffab00","#ff6b35","#f9a8d4","#6ee7b7","#93c5fd"];
        const color = colors[Math.floor(Math.random() * colors.length)];

        const { error: insertErr } = await sb.from("profiles").insert({
          id: userId,
          username: uname,
          display_name: dname,
          avatar_color: color,
        });

        if (insertErr) {
          // Profile may already exist — try update instead
          const { error: upsertErr } = await sb.from("profiles").upsert({
            id: userId,
            username: uname,
            display_name: dname,
            avatar_color: color,
          });
          if (upsertErr) { setError(upsertErr.message); setSaving(false); return; }
        }
      } catch (e: any) {
        setError(e.message || "Failed to save profile"); setSaving(false); return;
      }
    }

    // Always also save locally as fallback cache
    localStorage.setItem("th_username_" + userId, uname);
    localStorage.setItem("th_displayname_" + userId, dname);
    const registry = JSON.parse(localStorage.getItem("th_registry") || "{}");
    registry[uname] = { id: userId, username: uname, display_name: dname };
    localStorage.setItem("th_registry", JSON.stringify(registry));

    setSaving(false);
    window.location.reload();
  };

  const IS: React.CSSProperties = {
    width:"100%", height:44, background:"rgba(255,255,255,0.05)",
    border:"1px solid rgba(255,255,255,0.1)", borderRadius:10,
    color:"#f0f6fc", fontSize:14, padding:"0 14px",
    outline:"none", fontFamily:"inherit", boxSizing:"border-box",
  };

  const disabled = username.length < 3 || available === false || checking || saving;

  return (
    <div style={{ minHeight:"100vh", background:"#060a0f", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ width:"100%", maxWidth:420, background:"linear-gradient(160deg,#0f1520,#0b1017)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:22, overflow:"hidden", boxShadow:"0 0 80px rgba(0,0,0,0.8)" }}>
        <div style={{ height:2, background:"linear-gradient(90deg,transparent,#00e5ff,transparent)" }}/>
        <div style={{ padding:"36px 36px 32px" }}>
          <div style={{ textAlign:"center", marginBottom:28 }}>
            <div style={{ fontSize:26, fontWeight:900, color:"#f0f6fc", letterSpacing:"-0.04em", fontFamily:"monospace" }}>
              Trader<span style={{ color:"#00e5ff" }}>Hub</span>
            </div>
            <div style={{ fontSize:14, fontWeight:700, color:"#c9d1d9", marginTop:12 }}>Choose your username</div>
            <div style={{ fontSize:12, color:"#4b5563", marginTop:4 }}>This is how other traders will find and challenge you</div>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <div style={{ fontSize:10, color:"#4b5563", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>
                Username <span style={{ color:"#374151", textTransform:"none" }}>(public)</span>
              </div>
              <input value={username} onChange={e=>setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""))}
                onKeyDown={e=>e.key==="Enter"&&save()}
                placeholder="e.g. nqtrader99" style={IS} maxLength={20} autoFocus/>
              <div style={{ fontSize:10, marginTop:5, display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ color:"#374151" }}>{username.length}/20</span>
                {username.length >= 3 && (
                  checking ? <span style={{ color:"#4b5563" }}>Checking...</span>
                  : available === true  ? <span style={{ color:"#00e676", fontWeight:700 }}>✓ Available</span>
                  : available === false ? <span style={{ color:"#ff1744", fontWeight:700 }}>✗ Already taken</span>
                  : null
                )}
              </div>
            </div>

            <div>
              <div style={{ fontSize:10, color:"#4b5563", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>
                Display Name <span style={{ color:"#374151", textTransform:"none" }}>(optional)</span>
              </div>
              <input value={display} onChange={e=>setDisplay(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&save()}
                placeholder="Your name" style={IS} maxLength={30}/>
            </div>

            {error && <div style={{ padding:"10px 14px", borderRadius:9, background:"rgba(255,23,68,0.08)", border:"1px solid rgba(255,23,68,0.2)", fontSize:13, color:"#f87171" }}>{error}</div>}

            <button onClick={save} disabled={disabled} style={{
              height:46, borderRadius:11, border:"none",
              background: disabled ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg,#00e5ff,#0088bb)",
              color: disabled ? "#374151" : "#000",
              fontSize:14, fontWeight:800,
              cursor: disabled ? "default" : "pointer",
              marginTop:4,
              boxShadow: (!disabled) ? "0 0 24px rgba(0,229,255,0.25)" : "none",
              display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            }}>
              {saving
                ? <><div style={{ width:16, height:16, borderRadius:"50%", border:"2px solid rgba(0,229,255,0.3)", borderTop:"2px solid #00e5ff", animation:"spin 0.8s linear infinite" }}/> Saving...</>
                : "Enter TraderHub →"
              }
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export function UsernameSetup({ userId }: Props) {
  return <UsernameSetupLocal userId={userId}/>;
}
