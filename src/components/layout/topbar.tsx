"use client";
import { AccountSwitcher } from "@/components/ui/account-switcher";
import { useStore } from "@/store";
import { useAuth } from "@/components/auth/auth-provider";
import { useEffect, useState } from "react";

const TITLES: Record<string,{label:string;sub:string}> = {
  dashboard:{ label:"Dashboard",     sub:"Performance overview" },
  calendar: { label:"Calendar",      sub:"Daily P&L" },
  advanced: { label:"Deep Stats",    sub:"Heatmap · Tickers · Slippage" },
  playbook: { label:"Playbook",      sub:"Your trading setups" },
  checklist:{ label:"Checklist",     sub:"Risk calculator · Rules" },
  recap:    { label:"AI Recap",      sub:"End-of-day analysis" },
  social:   { label:"Community",     sub:"Messages · Friends" },
  patterns: { label:"AI Patterns",   sub:"Find hidden patterns · Groq AI" },
  backtest: { label:"Backtester",    sub:"Test strategies on real data" },
  edge:     { label:"Edge Stats",    sub:"Expectancy · Win Rate · Edge" },
  lifestyle:{ label:"Lifestyle",     sub:"Sleep · Focus · Routine" },
  trades:   { label:"Trade Log",     sub:"All positions" },
  analytics:{ label:"Analytics",     sub:"Deep insights" },
  markets:  { label:"Markets",       sub:"Live quotes" },
  import:   { label:"Import",        sub:"Add trades" },
  journal:  { label:"Journal",       sub:"Daily log" },
  settings: { label:"Settings",      sub:"Configuration" },
};

export function Topbar() {
  const { activeTab, setImportOpen } = useStore();
  const { user, loading } = useAuth();
  const [localUser, setLocalUser] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth < 768 : false);

  useEffect(() => {
    try { if (localStorage.getItem("th_user")) setLocalUser(true); } catch {}
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const hasSupabase = typeof process !== "undefined" && !!process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");
  const isAuthed = hasSupabase ? (!loading && !!user) : localUser;
  if (!isAuthed) return null;

  const t = TITLES[activeTab] || TITLES.dashboard;
  const now = new Date();

  return (
    <header style={{
      height: 54,
      background: "rgba(6,10,15,0.9)",
      backdropFilter: "blur(20px)",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
      display:"flex", alignItems:"center", justifyContent:"space-between",
      padding: isMobile ? "0 14px" : "0 22px",
      flexShrink:0, position:"relative" as const,
    }}>
      <div style={{ position:"absolute", bottom:0, left:0, right:0, height:1, background:"linear-gradient(90deg, transparent 0%, rgba(0,229,255,0.2) 40%, rgba(0,229,255,0.2) 60%, transparent 100%)", pointerEvents:"none" }}/>

      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        {isMobile && (
          <div style={{ width:28, height:28, borderRadius:8, background:"linear-gradient(135deg,#00e5ff,#0077aa)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:900, color:"#000", flexShrink:0 }}>T</div>
        )}
        <div>
          <div style={{ fontSize: isMobile ? 13 : 14, fontWeight:700, color:"#f0f6fc", letterSpacing:"-0.02em" }}>{t.label}</div>
          {!isMobile && <div style={{ fontSize:10, color:"#3d4551", marginTop:0 }}>{t.sub}</div>}
        </div>
      </div>

      <div style={{ display:"flex", alignItems:"center", gap: isMobile ? 8 : 10 }}>
        <AccountSwitcher/>
        {!isMobile && (
          <div style={{ fontSize:11, color:"#3d4551", fontFamily:"monospace" }}>
            {now.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}
          </div>
        )}
        <button onClick={() => setImportOpen(true)} style={{
          height: isMobile ? 32 : 34,
          padding: isMobile ? "0 12px" : "0 16px",
          borderRadius:9,
          background:"linear-gradient(135deg, #00e5ff 0%, #0088bb 100%)",
          border:"none", color:"#000", cursor:"pointer",
          fontSize: isMobile ? 11 : 12, fontWeight:800,
          display:"flex", alignItems:"center", gap:5,
          boxShadow:"0 0 20px rgba(0,229,255,0.35), 0 4px 12px rgba(0,0,0,0.4)",
          whiteSpace:"nowrap" as const,
        }}>
          <span style={{fontSize:14,fontWeight:400}}>+</span>
          {isMobile ? "Import" : "Import CSV"}
        </button>
      </div>
    </header>
  );
}
