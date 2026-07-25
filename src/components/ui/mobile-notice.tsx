"use client";
import { useEffect, useState } from "react";

const SEEN_KEY = "th_mobile_notice_seen";

/** One-per-session heads-up shown to mobile visitors right after they're
 * signed in — the mobile experience is newer/less battle-tested than
 * desktop, so this sets expectations up front instead of the user
 * discovering rough edges mid-task. Re-appears each new session (tab/
 * reload), not on every internal navigation within one. */
export function MobileNoticeGate({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(false);
  const [dismissed, setDismissed] = useState(true); // default true so nothing flashes before the check below runs
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const mobile = window.innerWidth < 768;
    setIsMobile(mobile);
    let seen = false;
    try { seen = sessionStorage.getItem(SEEN_KEY) === "1"; } catch {}
    setDismissed(seen);
    setChecked(true);
  }, []);

  const dismiss = () => {
    try { sessionStorage.setItem(SEEN_KEY, "1"); } catch {}
    setDismissed(true);
  };

  if (!checked || !isMobile || dismissed) return <>{children}</>;

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:100000, background:"rgba(0,0,0,0.9)",
      backdropFilter:"blur(12px)", display:"flex", alignItems:"center", justifyContent:"center", padding:20,
    }}>
      <div style={{
        width:"100%", maxWidth:380, background:"linear-gradient(160deg,#0f1520,#0b1017)",
        border:"1px solid rgba(255,171,0,0.2)", borderRadius:20, padding:28,
        boxShadow:"0 0 60px rgba(255,171,0,0.08)", textAlign:"center" as const,
      }}>
        <div style={{
          width:52, height:52, margin:"0 auto 16px", borderRadius:14,
          background:"rgba(255,171,0,0.1)", border:"1px solid rgba(255,171,0,0.3)",
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:24,
        }}>📱</div>
        <div style={{ fontSize:12, fontWeight:700, color:"#ffab00", letterSpacing:"0.1em", textTransform:"uppercase" as const, marginBottom:8 }}>
          Heads up
        </div>
        <div style={{ fontSize:16, fontWeight:800, color:"#f0f6fc", marginBottom:8 }}>
          Mobile is still a work in progress
        </div>
        <div style={{ fontSize:13, color:"#8b949e", lineHeight:1.6, marginBottom:20 }}>
          You may run into rough edges on phones — some screens and tools weren't built with mobile in mind yet.
          For the smoothest experience, we recommend using TraderHub on a <strong style={{color:"#c9d1d9"}}>desktop or laptop</strong>.
        </div>
        <button onClick={dismiss} style={{
          height:38, padding:"0 24px", borderRadius:9, border:"none", width:"100%",
          background:"linear-gradient(135deg,#ffab00,#cc8800)", color:"#000",
          fontSize:13, fontWeight:800, cursor:"pointer",
        }}>
          Got it, continue anyway
        </button>
      </div>
    </div>
  );
}
