"use client";

// Safe number formatter — prevents the site-crashing undefined.toFixed() error
function sf(n: unknown, d = 2): string {
  const v = typeof n === "number" ? n : parseFloat(String(n ?? ""));
  return Number.isFinite(v) ? v.toFixed(d) : "0";
}
import { useAuth } from "@/components/auth/auth-provider";
import { AuthPage } from "@/components/auth/auth-page";
import { UsernameSetup, UsernameSetupLocal } from "@/components/auth/username-setup";
import SocialPage from "@/components/social/social";
import { getMyProfile, Profile } from "@/lib/social";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/store";
import { invalidateSubscription } from "@/hooks/useSubscription";
import { useAccountStore } from "@/store/accounts";
import { calculateMetrics, buildEquityCurve } from "@/lib/calculations";
import { EquityChart } from "@/components/charts/equity-chart";
import { TradeTable } from "@/components/trades/trade-table";
import { ImportDialog } from "@/components/import/import-dialog";
import MarketsPage from "@/components/markets/markets";
import CalendarPage from "@/components/calendar/calendar-page";
import SettingsPage from "@/components/settings/settings";
import JournalPage from "@/components/journal/journal";
import AnalyticsPage from "@/components/analytics/analytics";
import PlaybookPage from "@/components/playbook/playbook";
import ChecklistPage from "@/components/checklist/checklist";
import DailyRecapPage from "@/components/recap/daily-recap";
import SimulatorPage from "@/components/simulator/simulator";
import PatternPage from "@/components/patterns/patterns";
import LifestylePage from "@/components/lifestyle/lifestyle";
import EconomicCalendar from "@/components/calendar/economic-calendar";
import GoalsPage from "@/components/ui/goals-page";
import LeaderboardPage from "@/components/social/leaderboard";
import { StreakTracker } from "@/components/ui/streak-tracker";
import { TradeCardBtn } from "@/components/ui/trade-card";
import { TradeAlerts } from "@/components/ui/trade-alerts";
import { GoalsWidget } from "@/components/ui/goals-widget";
import { fmt$, fmtN, fmtHold } from "@/lib/utils";
import { CandleChartBtn } from "@/components/ui/chart-popup";
import { AIAnalysisBtn } from "@/components/ui/ai-analysis";
import { Trade } from "@/types/trade";
import { format } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  ReferenceLine, LineChart, Line, CartesianGrid
} from "recharts";

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const TTP = {
  contentStyle:{ background:"rgba(6,10,15,0.97)", border:"1px solid rgba(0,229,255,0.15)", borderRadius:10, fontSize:11, padding:"8px 12px", boxShadow:"0 8px 32px rgba(0,0,0,0.6)" },
  labelStyle:{ color:"#4b5563" }, itemStyle:{ color:"#c9d1d9" },
};

// 3D Panel with glow variant
function Panel({ children, p=20, glow, style }: {
  children: React.ReactNode; p?: number; glow?: "green"|"red"|"cyan"|"purple"; style?: React.CSSProperties;
}) {
  const glowMap = {
    green: "0 0 30px rgba(0,230,118,0.1), 0 0 1px rgba(0,230,118,0.3) inset",
    red:   "0 0 30px rgba(255,23,68,0.1),  0 0 1px rgba(255,23,68,0.2)  inset",
    cyan:  "0 0 30px rgba(0,229,255,0.1),  0 0 1px rgba(0,229,255,0.3)  inset",
    purple:"0 0 30px rgba(213,0,249,0.08), 0 0 1px rgba(213,0,249,0.2)  inset",
  };
  const topLine = {
    green: "linear-gradient(90deg, transparent, rgba(0,230,118,0.6), transparent)",
    red:   "linear-gradient(90deg, transparent, rgba(255,23,68,0.5),  transparent)",
    cyan:  "linear-gradient(90deg, transparent, rgba(0,229,255,0.6),  transparent)",
    purple:"linear-gradient(90deg, transparent, rgba(213,0,249,0.5),  transparent)",
  };
  return (
    <div style={{
      background:"linear-gradient(160deg, #0f1520 0%, #0b1017 100%)",
      border:"1px solid rgba(255,255,255,0.07)",
      borderRadius:16, padding:p, position:"relative" as const,
      boxShadow: glow
        ? `0 1px 0 rgba(255,255,255,0.06) inset, 0 8px 32px rgba(0,0,0,0.5), ${glowMap[glow]}`
        : "0 1px 0 rgba(255,255,255,0.05) inset, 0 8px 32px rgba(0,0,0,0.4)",
      ...style,
    }}>
      {glow && <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:topLine[glow], opacity:0.9, pointerEvents:"none", borderRadius:"16px 16px 0 0" }}/>}
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.1em", color:"#3d4551", marginBottom:14 }}>{children}</div>;
}

// Metric mini-card
function Stat({ label, value, color = "#c9d1d9", sub }: { label:string; value:string; color?:string; sub?:string }) {
  return (
    <div>
      <div style={{ fontSize:9, color:"#3d4551", textTransform:"uppercase" as const, letterSpacing:"0.09em", marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:16, fontWeight:800, fontFamily:"monospace", color, letterSpacing:"-0.03em", lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:9, color:"#4b5563", marginTop:2 }}>{sub}</div>}
    </div>
  );
}

//  DASHBOARD 
function getStoredUsername(): string | undefined {
  if (typeof window === "undefined") return undefined;
  // Find any th_username_* key in localStorage
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("th_username_")) {
      return localStorage.getItem(key) || undefined;
    }
  }
  return undefined;
}

function Dashboard() {
  const { trades: storeTrades, setImportOpen } = useStore();
  const { getActiveTrades } = useAccountStore();
  // Every one of these can be undefined mid-hydration — normalize to arrays
  // before touching .length / .filter, otherwise the whole page throws.
  const acctTrades = getActiveTrades() ?? [];
  const safeStore  = Array.isArray(storeTrades) ? storeTrades : [];
  const trades = acctTrades.length >= safeStore.length ? acctTrades : safeStore;
  const closed = useMemo(
    () => (Array.isArray(trades) ? trades : []).filter(t => t && t.status === "CLOSED" && t.netPnl !== null),
    [trades]
  );
  const M = useMemo(() => calculateMetrics(closed as Trade[]), [closed]);
  const equity = useMemo(() => buildEquityCurve(closed as Trade[]), [closed]);
  const isPos = M.totalNetPnl >= 0;
  const netColor = isPos ? "#00e676" : "#ff1744";
  const pct = M.totalTrades > 0 ? Math.round((M.winCount / M.totalTrades) * 100) : 0;
  const [isMob, setIsMob] = useState(()=>typeof window!=="undefined"&&window.innerWidth<768);
  useEffect(()=>{ const h=()=>setIsMob(window.innerWidth<768); window.addEventListener("resize",h); return ()=>window.removeEventListener("resize",h); },[]);
  const recent = useMemo(() => [...closed].sort((a,b) => new Date(b.entryTime||0).getTime() - new Date(a.entryTime||0).getTime()).slice(0,8), [closed]);
  return (
    <div style={{ padding:20, overflowY:"auto", height:"100%", display:"flex", flexDirection:"column", gap:14 }}>

      {/* -- HERO -- */}
      <Panel glow={isPos ? "green" : "red"} p={isMob?16:24} style={{paddingTop:isMob?16:28}}>
        {isMob ? (
          /* Mobile hero — compact stacked layout */
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{fontSize:9,color:"#3d4551",textTransform:"uppercase" as const,letterSpacing:"0.1em"}}>Net P&L — All Time</div>
            <div style={{fontSize:36,fontWeight:900,fontFamily:"monospace",color:netColor,letterSpacing:"-0.05em",lineHeight:1,
              textShadow:`0 0 30px ${netColor}50`}}>{isPos?"+":""}{fmt$(M.totalNetPnl)}</div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:11,color:"#4b5563"}}>{M.totalTrades} trades</span>
              <span style={{fontSize:11,color:"#00e676",fontWeight:700}}>▲ {M.winCount} ({pct}%)</span>
              <span style={{fontSize:11,color:"#ff1744",fontWeight:700}}>▼ {M.lossCount}</span>
            </div>
            <div style={{height:5,borderRadius:3,background:"rgba(255,255,255,0.05)",overflow:"hidden"}}>
              <div style={{height:"100%",width:`${pct}%`,borderRadius:3,background:"linear-gradient(90deg,#00e676,#00b050)",transition:"width 0.8s ease"}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginTop:4}}>
              <Stat label="Profit Factor" value={M.profitFactor===Infinity?"∞":fmtN(M.profitFactor)} color="#00e5ff"/>
              <Stat label="Avg Win" value={fmt$(M.avgWin)} color="#00e676"/>
              <Stat label="Avg Loss" value={fmt$(M.avgLoss)} color="#ff1744"/>
            </div>
          </div>
        ) : (
          /* Desktop hero */
          <div style={{ display:"flex", alignItems:"center", gap:32, flexWrap:"nowrap", overflowX:"auto" }}>
            <div>
              <div style={{ fontSize:10, color:"#3d4551", textTransform:"uppercase" as const, letterSpacing:"0.1em", marginBottom:6 }}>Net P&L — All Time</div>
              <div style={{ fontSize:40, fontWeight:900, fontFamily:"monospace", color:netColor, letterSpacing:"-0.05em", lineHeight:1.1,
                textShadow:`0 0 40px ${netColor}60, 0 0 80px ${netColor}20` }}>
                {isPos ? "+" : ""}{fmt$(M.totalNetPnl)}
              </div>
              <div style={{ fontSize:11, color:"#4b5563", marginTop:6 }}>{M.totalTrades} closed trades · {M.winCount}W {M.lossCount}L</div>
            </div>
            <div style={{ width:1, height:60, background:"rgba(255,255,255,0.06)", alignSelf:"center" }}/>
            <div style={{ minWidth:170 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:7 }}>
                <span style={{ fontSize:11, color:"#00e676", fontWeight:700, fontFamily:"monospace" }}>▲ {M.winCount} WINS {pct}%</span>
                <span style={{ fontSize:11, color:"#ff1744", fontWeight:700, fontFamily:"monospace" }}>▼ {M.lossCount}</span>
              </div>
              <div style={{ height:6, borderRadius:3, background:"rgba(255,255,255,0.05)", overflow:"hidden", boxShadow:"inset 0 1px 2px rgba(0,0,0,0.4)" }}>
                <div style={{ height:"100%", width:`${pct}%`, borderRadius:3,
                  background:"linear-gradient(90deg, #00e676, #00b050)",
                  boxShadow:"0 0 10px rgba(0,230,118,0.5)", transition:"width 0.8s ease" }}/>
              </div>
            </div>
            <div style={{ width:1, height:60, background:"rgba(255,255,255,0.06)", alignSelf:"center" }}/>
            <div style={{ display:"flex", gap:28, flexWrap:"wrap" }}>
              <Stat label="Profit Factor" value={M.profitFactor===Infinity?"∞":fmtN(M.profitFactor)} color="#00e5ff" sub="win÷loss"/>
              <Stat label="Avg Win" value={fmt$(M.avgWin)} color="#00e676"/>
              <Stat label="Avg Loss" value={fmt$(M.avgLoss)} color="#ff1744"/>
              <Stat label="Expectancy" value={fmt$(M.expectancy)} color={M.expectancy>=0?"#00e676":"#ff1744"} sub="per trade"/>
              <Stat label="Sharpe" value={fmtN(M.sharpeRatio)} color="#d500f9" sub="annualized"/>
            </div>
          </div>
        )}
      </Panel>

      {!closed.length && (
        <div style={{ padding:"14px 18px", borderRadius:10, background:"rgba(0,229,255,0.05)", border:"1px solid rgba(0,229,255,0.15)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontSize:13, color:"#4b5563" }}>No trades yet — import a CSV to get started</span>
          <button onClick={() => setImportOpen(true)} style={{ height:30, padding:"0 14px", borderRadius:7, background:"linear-gradient(135deg,#00e5ff,#0088bb)", border:"none", color:"#000", fontSize:12, fontWeight:800, cursor:"pointer", boxShadow:"0 0 16px rgba(0,229,255,0.3)" }}>
            Import CSV
          </button>
        </div>
      )}

      {/* -- GOALS + STREAK TRACKER -- */}
      <div style={{ display:"grid", gridTemplateColumns:isMob?"1fr":"1fr 1fr", gap:14, marginTop:4 }}>
        <GoalsWidget trades={closed as Trade[]}/>
        <StreakTracker/>
      </div>

      {/* -- SECONDARY METRIC GRID -- */}
      <div style={{ display:"grid", gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(8,1fr)", gap:10 }}>
        {([
          ["Max Drawdown",    fmt$(M.maxDrawdown),     "#ff1744",  "red"],
          ["Largest Win",     fmt$(M.largestWin),      "#00e676",  "green"],
          ["Largest Loss",    fmt$(M.largestLoss),     "#ff1744",  "red"],
          ["Avg Hold",        fmtHold(M.avgHoldTime),  "#00e5ff",  "cyan"],
          ["Consec. Wins",    String(M.consecutiveWins ?? 0),"#00e676", "green"],
          ["Consec. Losses",  String(M.consecutiveLosses ?? 0),"#ff1744","red"],
          ["Avg R",           (()=>{ const r=Number.isFinite(M.avgRMultiple)?M.avgRMultiple:null; return r===null?"N/A":(r>=0?"+":"")+r.toFixed(2)+"R"; })(), Number.isFinite(M.avgRMultiple)&&M.avgRMultiple>=0?"#00e676":"#4b5563", Number.isFinite(M.avgRMultiple)&&M.avgRMultiple>=0?"green":undefined],
          ["Total Fees",      fmt$(M.totalFees),       "#4b5563",  undefined],
        ] as [string,string,string,string|undefined][]).map(([l,v,c,g]) => (
          <Panel key={l} p={14} glow={g as any} style={{ cursor:"default" }}>
            <div style={{ fontSize:9, color:"#3d4551", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:7 }}>{l}</div>
            <div style={{ fontSize:19, fontWeight:800, fontFamily:"monospace", color:c, letterSpacing:"-0.03em",
              textShadow:`0 0 20px ${c}40` }}>{v}</div>
          </Panel>
        ))}
      </div>

      {/* -- EQUITY + RECENT TRADES -- */}
      <div style={{ display:"grid", gridTemplateColumns:isMob?"1fr":"1fr 300px", gap:14 }}>
        <Panel glow="cyan">
          <Label>Equity Curve</Label>
          <EquityChart data={equity} height={220}/>
        </Panel>
        <Panel>
          <Label>Recent Trades</Label>
          {recent.length === 0
            ? <div style={{ textAlign:"center" as const, padding:"30px 0", color:"#3d4551", fontSize:12 }}>No trades yet</div>
            : <div style={{ display:"flex", flexDirection:"column", gap:5, overflow:"hidden" }}> 
              {recent.map(t => (
                <div key={t.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"7px 10px", borderRadius:8,
                  background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.04)",
                  transition:"background 0.1s", minWidth:0, overflow:"hidden" }}
                  onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.04)"}
                  onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.02)"}
                >
                  <div style={{ display:"flex", alignItems:"center", gap:6, minWidth:0, overflow:"hidden", flexShrink:1 }}>
                    <span style={{ width:6, height:6, borderRadius:"50%", background:(t.netPnl||0)>=0?"#00e676":"#ff1744", display:"inline-block", flexShrink:0,
                      boxShadow:`0 0 6px ${(t.netPnl||0)>=0?"#00e676":"#ff1744"}` }}/>
                    <span style={{ fontWeight:700, fontSize:12, color:"#f0f6fc", fontFamily:"monospace", flexShrink:0 }}>{t.ticker}</span>
                    <span style={{ fontSize:9, padding:"1px 5px", borderRadius:4, fontWeight:700, flexShrink:0,
                      background: t.assetClass==="FUTURES"?"rgba(213,0,249,0.1)": t.assetClass==="FOREX"?"rgba(0,229,255,0.1)":"rgba(0,230,118,0.1)",
                      color: t.assetClass==="FUTURES"?"#d500f9": t.assetClass==="FOREX"?"#00e5ff":"#00e676" }}>{t.assetClass}</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
                    <CandleChartBtn trade={t} size={22}/>
                    <AIAnalysisBtn trade={t} size={22}/>
                    <TradeCardBtn trade={t} username={getStoredUsername()}/>
                    <div style={{ textAlign:"right" as const }}>
                      <div style={{ fontWeight:800, fontSize:13, fontFamily:"monospace",
                        color:(t.netPnl||0)>=0?"#00e676":"#ff1744",
                        textShadow:`0 0 12px ${(t.netPnl||0)>=0?"rgba(0,230,118,0.4)":"rgba(255,23,68,0.4)"}` }}>
                        {fmt$(t.netPnl||0)}
                      </div>
                      <div style={{ fontSize:9, color:"#3d4551" }}>{format(new Date(t.entryTime),"MMM d")}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          }
        </Panel>
      </div>


    </div>
  );
}

// Social wrapper that loads real profile
function SocialPageWrapper({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");

  useEffect(() => {
    async function load() {
      if (hasSupabase) {
        try {
          const p = await getMyProfile(userId);
          if (p) { setProfile(p); setLoadingProfile(false); return; }
        } catch {}
      }
      // fallback to localStorage
      const username = localStorage.getItem("th_username_" + userId) || "trader";
      const display_name = localStorage.getItem("th_displayname_" + userId) || username;
      setProfile({ id: userId, username, display_name, avatar_color: "#00e5ff", created_at: new Date().toISOString() });
      setLoadingProfile(false);
    }
    load();
  }, [userId, hasSupabase]);

  if (loadingProfile || !profile) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%" }}>
      <div style={{ width:32, height:32, borderRadius:"50%", border:"2px solid rgba(0,229,255,0.15)", borderTop:"2px solid #00e5ff", animation:"spin 0.8s linear infinite" }}/>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
  return <SocialPage myProfile={profile}/>;
}

//  PAGE SHELL 
export default function Page() {
  const { activeTab, init } = useStore();
  const { user, loading } = useAuth();
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("subscribed=1")) {
      invalidateSubscription();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);
  // Also check localStorage user (fallback when no Supabase)
  const [localUser, setLocalUser] = useState<{id:string;email:string}|null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("th_user");
      if (saved) setLocalUser(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => { init(); }, [init]);
  const d = <><ImportDialog/><TradeAlerts/></>;

  const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");

  if (loading) return (
    <div style={{minHeight:"100vh",background:"#060a0f",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:36,height:36,borderRadius:"50%",border:"2px solid rgba(0,229,255,0.15)",borderTop:"2px solid #00e5ff",animation:"spin 0.8s linear infinite"}}/>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );

  const activeUser = hasSupabase ? user : localUser;
  if (!activeUser) return <AuthPage onAuth={()=>{ try{const s=localStorage.getItem("th_user");if(s)setLocalUser(JSON.parse(s));}catch{} }}/>;

  // Username gate  checks Supabase profile (with localStorage cache) before showing setup
  return <UsernameGate userId={activeUser.id} hasSupabase={hasSupabase}>
    <AppContent activeTab={activeTab} activeUser={activeUser} d={d}/>
  </UsernameGate>;
}

//  Username gate: checks Supabase profile before showing setup screen 
function UsernameGate({ userId, hasSupabase, children }: { userId: string; hasSupabase: boolean; children: React.ReactNode }) {
  const [state, setState] = useState<"checking"|"needs-setup"|"ready">(() => {
    // Fast path: localStorage cache
    if (typeof window !== "undefined" && localStorage.getItem("th_username_" + userId)) return "ready";
    return "checking";
  });

  useEffect(() => {
    if (state === "ready") return;
    let cancelled = false;
    (async () => {
      // Local cache check
      if (localStorage.getItem("th_username_" + userId)) {
        if (!cancelled) setState("ready");
        return;
      }
      // Supabase profile check
      if (hasSupabase) {
        try {
          const { createClient } = await import("@/lib/supabase");
          const sb = createClient();
          const { data, error } = await sb.from("profiles").select("username,display_name").eq("id", userId).maybeSingle();
          if (error) console.error("[UsernameGate] profile query error:", error.message);
          if (!cancelled && data?.username) {
            localStorage.setItem("th_username_" + userId, data.username);
            if (data.display_name) localStorage.setItem("th_displayname_" + userId, data.display_name);
            setState("ready");
            return;
          }
          // No profile found  user needs to pick a username
          console.log("[UsernameGate] no profile found for user, showing setup");
        } catch (e) {
          console.error("[UsernameGate] check failed:", e);
        }
      }
      if (!cancelled) setState("needs-setup");
    })();
    return () => { cancelled = true; };
  }, [userId, hasSupabase, state]);

  if (state === "checking") return (
    <div style={{minHeight:"100vh",background:"#060a0f",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:36,height:36,borderRadius:"50%",border:"2px solid rgba(0,229,255,0.15)",borderTop:"2px solid #00e5ff",animation:"spin 0.8s linear infinite"}}/>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
  if (state === "needs-setup") return <UsernameSetupLocal userId={userId}/>;
  return <>{children}</>;
}

//  Main app content (post-auth, post-username) 
function AppContent({ activeTab, activeUser, d }: { activeTab: string; activeUser: { id: string }; d: React.ReactNode }) {
  const { setImportOpen } = useStore();

  if (activeTab === "trades") return (
    <><div style={{height:"calc(100vh - 54px)",display:"flex",flexDirection:"column",padding:20}}>
      <div style={{flex:1,borderRadius:16,overflow:"hidden",background:"linear-gradient(160deg,#0f1520,#0b1017)",border:"1px solid rgba(255,255,255,0.07)"}}>
        <TradeTable/>
      </div>
    </div>{d}</>
  );
  if (activeTab === "analytics") return <><AnalyticsPage/>{d}</>;
  if (activeTab === "playbook")  return <><PlaybookPage/>{d}</>;
  if (activeTab === "checklist") return <><ChecklistPage/>{d}</>;
  if (activeTab === "recap")     return <><DailyRecapPage/>{d}</>;
  if (activeTab === "simulator") return <><SimulatorPage/>{d}</>;
  if (activeTab === "social") return <div style={{height:"100%",overflow:"hidden"}}><SocialPageWrapper userId={activeUser.id}/>{d}</div>;
  if (activeTab === "patterns")  return <><PatternPage/>{d}</>;
  if (activeTab === "goals")       return <><GoalsPage/>{d}</>;
  if (activeTab === "econ")        return <><EconomicCalendar/>{d}</>;
  if (activeTab === "calendar")  return <><CalendarPage/>{d}</>;
  if (activeTab === "markets")   return <><MarketsPage/>{d}</>;
  if (activeTab === "settings")  return <><SettingsPage/>{d}</>;
  if (activeTab === "journal")   return <><JournalPage/>{d}</>;
  if (activeTab === "import") return (
    <><div style={{height:"calc(100vh - 54px)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center" as const}}>
        <div style={{fontSize:48,marginBottom:16,filter:"drop-shadow(0 0 20px rgba(0,229,255,0.4))"}}>📂</div>
        <h2 style={{fontSize:22,fontWeight:900,color:"#f0f6fc",marginBottom:8,letterSpacing:"-0.03em"}}>Import Trades</h2>
        <p style={{fontSize:13,color:"#4b5563",marginBottom:24}}>TradingView · Webull · IBKR · NinjaTrader · Generic CSV</p>
        <button onClick={()=>setImportOpen(true)} style={{height:42,padding:"0 32px",borderRadius:12,background:"linear-gradient(135deg,#00e5ff,#0088bb)",border:"none",color:"#000",fontSize:14,fontWeight:900,cursor:"pointer",boxShadow:"0 0 30px rgba(0,229,255,0.4), 0 8px 20px rgba(0,0,0,0.4)"}}>
          Choose File
        </button>
      </div>
    </div>{d}</>
  );
  return <><Dashboard/>{d}</>;
}
