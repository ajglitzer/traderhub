"use client";
import { useState, useEffect } from "react";

export const COMMUNITY_RULES: { title: string; desc: string }[] = [
  { title: "Be respectful", desc: "No harassment, hate speech, threats, or personal attacks toward other traders." },
  { title: "No spam", desc: "Don't use DMs or your profile to spam, advertise, or self-promote unrelated services." },
  { title: "No impersonation", desc: "Don't pretend to be another trader, TraderHub staff, or a public figure." },
  { title: "Keep it appropriate", desc: "No illegal, explicit, or otherwise inappropriate content in messages, bios, or shared trades." },
  { title: "Respect privacy", desc: "Don't share someone else's private messages or personal information without their consent." },
  { title: "Not financial advice", desc: "Trade discussions and shared results are for education and community — not investment advice. Trade at your own risk." },
  { title: "Violations have consequences", desc: "Breaking these rules can lead to warnings, feature restrictions, or account suspension." },
];

export function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:99999, background:"rgba(0,0,0,0.85)", backdropFilter:"blur(10px)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#0e1117", border:"1px solid rgba(255,255,255,0.1)", borderRadius:18, padding:28, width:"100%", maxWidth:460, maxHeight:"85vh", overflowY:"auto" as const }}>
        <div style={{ fontSize:32, marginBottom:8, textAlign:"center" as const }}>📜</div>
        <div style={{ fontSize:18, fontWeight:900, color:"#f0f6fc", marginBottom:4, textAlign:"center" as const }}>Community Guidelines</div>
        <div style={{ fontSize:12, color:"#4b5563", marginBottom:20, textAlign:"center" as const, lineHeight:1.6 }}>A few ground rules for TraderHub's community features.</div>
        <div style={{ display:"flex", flexDirection:"column" as const, gap:12, marginBottom:22 }}>
          {COMMUNITY_RULES.map((r,i)=>(
            <div key={i} style={{ display:"flex", gap:12, padding:"12px 14px", background:"rgba(255,255,255,0.03)", borderRadius:10, border:"1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize:13, fontWeight:800, color:"#00e5ff", flexShrink:0, width:20 }}>{i+1}</div>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:"#f0f6fc", marginBottom:2 }}>{r.title}</div>
                <div style={{ fontSize:12, color:"#6b7280", lineHeight:1.6 }}>{r.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={onClose} style={{ width:"100%", padding:"13px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#00e5ff,#0088bb)", color:"#000", fontSize:14, fontWeight:800, cursor:"pointer" }}>
          Got it
        </button>
      </div>
    </div>
  );
}

// Shows the rules modal once per user (tracked in localStorage), the first
// time they land in the app after finishing signup/username setup.
export function RulesGate({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem(`th_rules_seen_${userId}`)) setShow(true);
    } catch {}
  }, [userId]);
  const dismiss = () => {
    try { localStorage.setItem(`th_rules_seen_${userId}`, "1"); } catch {}
    setShow(false);
  };
  return <>{children}{show && <RulesModal onClose={dismiss}/>}</>;
}
