"use client";
import { PricingModal, ManageSubscription } from "@/components/subscription/pro-gate";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/components/auth/auth-provider";
import { useState, useRef, useEffect } from "react";
import { useStore } from "@/store";
import { useAccountStore, clearCloud, CLEARED_FLAG, markSessionCleared } from "@/store/accounts";
import { exportToCSV, exportToJSON, importFromJSON } from "@/lib/export";
import { Trade } from "@/types/trade";

function ProfileEditor({ userId }: { userId?: string }) {
  const [bio, setBio] = useState("");
  const [showReal, setShowReal] = useState(false);
  const [twitter, setTwitter] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const username = typeof window !== "undefined" ? (() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("th_username_")) return localStorage.getItem(k) || "";
    }
    return "";
  })() : "";

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    (async () => {
      try {
        const { createClient } = await import("@/lib/supabase");
        const sb = createClient();
        const { data } = await sb.from("profiles").select("bio,show_real_stats,twitter").eq("id", userId).maybeSingle();
        if (data) { setBio(data.bio || ""); setShowReal(data.show_real_stats || false); setTwitter(data.twitter || ""); }
      } catch {}
      setLoading(false);
    })();
  }, [userId]);

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const { createClient } = await import("@/lib/supabase");
      const sb = createClient();
      await sb.from("profiles").update({ bio, show_real_stats: showReal, twitter }).eq("id", userId);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  const profileUrl = username ? `https://traderhub-nine.vercel.app/u/${username}` : "";

  const IS = { width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:8, color:"#d1d5db", fontSize:13, padding:"8px 12px", outline:"none", fontFamily:"inherit" } as const;
  const LB = { fontSize:10, fontWeight:700 as const, textTransform:"uppercase" as const, letterSpacing:"0.08em", color:"#3d4551", marginBottom:5, display:"block" };

  if (loading) return <div style={{ color:"#4b5563", fontSize:12 }}>Loading profile...</div>;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {/* Public URL */}
      {username && (
        <div>
          <span style={LB}>Your Public Profile URL</span>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ flex:1, height:34, background:"rgba(0,229,255,0.04)", border:"1px solid rgba(0,229,255,0.12)", borderRadius:8, padding:"0 12px", display:"flex", alignItems:"center", fontSize:12, color:"#00e5ff", fontFamily:"monospace", overflow:"hidden" }}>
              {profileUrl}
            </div>
            <button onClick={() => { navigator.clipboard.writeText(profileUrl); }} style={{ height:34, padding:"0 14px", borderRadius:8, border:"1px solid rgba(0,229,255,0.2)", background:"rgba(0,229,255,0.06)", color:"#00e5ff", fontSize:11, fontWeight:700, cursor:"pointer", flexShrink:0 }}>Copy</button>
            <a href={profileUrl} target="_blank" rel="noreferrer" style={{ height:34, padding:"0 14px", borderRadius:8, border:"1px solid rgba(255,255,255,0.08)", background:"rgba(255,255,255,0.03)", color:"#6b7280", fontSize:11, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", textDecoration:"none", flexShrink:0 }}>View ↗</a>
          </div>
        </div>
      )}

      {/* Bio */}
      <div>
        <span style={LB}>Bio</span>
        <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell other traders about yourself..." rows={3} maxLength={200}
          style={{ ...IS, resize:"vertical" as const, width:"100%", boxSizing:"border-box" as const }}/>
        <div style={{ fontSize:10, color:"#374151", marginTop:3 }}>{bio.length}/200</div>
      </div>

      {/* Twitter */}
      <div>
        <span style={LB}>Twitter / X Handle</span>
        <input value={twitter} onChange={e => setTwitter(e.target.value.replace("@",""))} placeholder="yourhandle (no @)" style={IS}/>
      </div>

      {/* Stats toggle */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", background:"rgba(255,255,255,0.02)", borderRadius:10, border:"1px solid rgba(255,255,255,0.06)" }}>
        <div>
          <div style={{ fontSize:13, fontWeight:600, color:"#c9d1d9" }}>Show real trading stats publicly</div>
          <div style={{ fontSize:11, color:"#4b5563", marginTop:2 }}>P&L, win rate, and trade history visible on your profile</div>
        </div>
        <button onClick={() => setShowReal(s => !s)} style={{ width:44, height:24, borderRadius:12, border:"none", cursor:"pointer", background: showReal ? "#00e5ff" : "rgba(255,255,255,0.1)", position:"relative" as const, flexShrink:0, transition:"background 0.2s" }}>
          <div style={{ width:18, height:18, borderRadius:"50%", background:"#fff", position:"absolute" as const, top:3, left: showReal ? 22 : 3, transition:"left 0.2s", boxShadow:"0 1px 4px rgba(0,0,0,0.4)" }}/>
        </button>
      </div>

      <button onClick={save} disabled={saving} style={{ height:38, borderRadius:9, border:`1px solid ${saved ? "rgba(0,230,118,0.3)" : "transparent"}`, background: saved ? "rgba(0,230,118,0.2)" : "linear-gradient(135deg,#00e5ff,#0088bb)", color: saved ? "#00e676" : "#000", fontSize:13, fontWeight:800, cursor:"pointer" }}>
        {saving ? "Saving..." : saved ? "✓ Saved" : "Save Profile"}
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background:"#0e1117", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12, overflow:"hidden", marginBottom:14 }}>
      <div style={{ padding:"10px 18px", borderBottom:"1px solid rgba(255,255,255,0.05)", fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.08em", color:"#4b5563" }}>{title}</div>
      <div style={{ padding:18 }}>{children}</div>
    </div>
  );
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
      <div>
        <div style={{ fontSize:13, color:"#d1d5db", fontWeight:500 }}>{label}</div>
        {desc && <div style={{ fontSize:11, color:"#4b5563", marginTop:2 }}>{desc}</div>}
      </div>
      {children}
    </div>
  );
}

interface ConfirmBtnProps {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  danger?: boolean;
  primary?: boolean;
}

function ConfirmBtn({ label, confirmLabel, onConfirm, danger, primary }: ConfirmBtnProps) {
  const [pending, setPending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>|null>(null);

  const handleClick = () => {
    if (pending) {
      onConfirm();
      setPending(false);
      if (timerRef.current) clearTimeout(timerRef.current);
    } else {
      setPending(true);
      timerRef.current = setTimeout(() => setPending(false), 5000);
    }
  };

  const bg = pending
    ? danger ? "#f87171" : "#fbbf24"
    : danger ? "rgba(248,113,113,0.1)" : primary ? "#00b4d8" : "rgba(255,255,255,0.06)";
  const color = pending ? "#000" : danger ? "#f87171" : primary ? "#000" : "#d1d5db";
  const border = pending ? "none" : danger ? "1px solid rgba(248,113,113,0.2)" : primary ? "none" : "1px solid rgba(255,255,255,0.08)";

  return (
    <button onClick={handleClick} style={{ height:32, padding:"0 14px", borderRadius:8, background:bg, border, color, fontSize:12, fontWeight:600, cursor:"pointer", transition:"all 0.15s", minWidth:140, textAlign:"center" as const }}>
      {pending ? `⚠ ${confirmLabel}` : label}
    </button>
  );
}

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { isPro } = useSubscription();
  const [showUpgrade, setShowUpgrade] = useState<string|null>(null);
  const { theme, setTheme, simShowLevels, setSimShowLevels, replayShowLevels, setReplayShowLevels } = useStore();
  const { activeAccountId, getActiveTrades, setAccountTrades, addAccountTrades } = useAccountStore();
  const allTrades = getActiveTrades() ?? [];
  const [toast, setToast] = useState<{msg:string;type:"ok"|"err"}|null>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string, type: "ok"|"err" = "ok") => {
    setToast({msg, type});
    setTimeout(() => setToast(null), 3500);
  };

  const handleExportCSV = () => {
    if(!isPro){ setShowUpgrade("Export CSV"); return; }
    // isPro confirmed
    exportToCSV(allTrades, `traderhub_${new Date().toISOString().slice(0,10)}.csv`);
    showToast(`✓ Exported ${allTrades.length} trades as CSV`);
  };

  const handleExportJSON = () => {
    if(!isPro){ setShowUpgrade("Export JSON"); return; }
    exportToJSON(allTrades, `traderhub_backup_${new Date().toISOString().slice(0,10)}.json`);
    showToast(`✓ Exported ${allTrades.length} trades as JSON backup`);
  };

  const handleImportJSON = async (file: File) => {
    try {
      const imported = await importFromJSON(file);
      addAccountTrades(activeAccountId, imported as Trade[]);
      const existing = getActiveTrades();
      const merged = [...(imported as Trade[]), ...existing];
      setAccountTrades(activeAccountId, merged);
      showToast(`✓ Restored ${imported.length} trades from backup`);
    } catch(e) {
      showToast(`Error: ${String(e)}`, "err");
    }
  };

  const handleDeleteAccount = async () => {
    try {
      // 1. Clear all local data
      await handleClearAll();
      // 2. Delete from Supabase via API
      const res = await fetch("/api/user/delete", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete account");
      // 3. Sign out
      const { createClient } = await import("@/lib/supabase");
      const sb = createClient();
      await sb.auth.signOut();
      window.location.href = "/";
    } catch (e) {
      showToast("Failed to delete account — please try again");
    }
  };

  const handleClearAll = async () => {
    const uid = (() => { try { return localStorage.getItem("th_current_user_id") || ""; } catch { return ""; } })();

    // STEP 1: Set flags SYNCHRONOUSLY — both in-memory (blocks this session)
    // and in localStorage (blocks the next page load after refresh)
    markSessionCleared();
    if (uid) {
      localStorage.setItem(`${CLEARED_FLAG}__${uid}`, "1");
      console.log("[TraderHub] cleared flag set for", uid);
    }

    // STEP 2: Clear in-memory store
    setAccountTrades(activeAccountId, []);

    // STEP 3: Wipe all localStorage trade keys for this user
    const uiKey = uid ? `tv-ui-store__${uid}` : "tv-ui-store";
    let savedUIStore: string | null = null;
    try {
      const uiStore = localStorage.getItem(uiKey);
      if (uiStore) {
        const parsed = JSON.parse(uiStore);
        savedUIStore = JSON.stringify({ ...parsed, state: { ...parsed.state, trades: [] } });
      }
    } catch {}

    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const isTradeKey =
        key.startsWith("traderhub") ||
        key.startsWith("tv-accounts-store") ||
        key.startsWith("th_accounts_v2_") ||
        key.startsWith("th_accounts_v2__") ||
        key.startsWith("th_accts_v3__") ||
        key.startsWith("th_accts__") ||
        key === "th_accts";
      if (!isTradeKey) continue;
      if (uid && !key.includes(uid) && key !== "th_accts") continue;
      keysToRemove.push(key);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    // Restore UI store with playbook intact
    if (savedUIStore) localStorage.setItem(uiKey, savedUIStore);

    // STEP 4: Clear cloud (async — flag already set above so refresh is safe)
    console.log("[TraderHub] clearing cloud...");
    await clearCloud();
    console.log("[TraderHub] cloud cleared");
    showToast("✓ All trade data cleared");
  };

  return (
    <>
    {showUpgrade&&<PricingModal onClose={()=>setShowUpgrade(null)}/>}
    <div style={{ padding:20, overflowY:"auto", height:"100%", maxWidth:700 }}>



      <Section title="Account">
        <Row label="Signed in as" desc={user?.email || "Unknown"}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{padding:"4px 12px",borderRadius:8,background:"rgba(0,229,255,0.08)",border:"1px solid rgba(0,229,255,0.15)",color:"#00e5ff",fontSize:12,fontFamily:"monospace"}}>{user?.email}</div>
            <button
              onClick={async()=>{
  if(window.confirm("Sign out of TraderHub?")) {
    await signOut();
    localStorage.removeItem("th_user");
    localStorage.removeItem("th_current_user_id");
    window.location.reload();
  }
}}
              style={{height:32,padding:"0 16px",borderRadius:8,border:"1px solid rgba(255,23,68,0.25)",background:"rgba(255,23,68,0.08)",color:"#f87171",cursor:"pointer",fontSize:12,fontWeight:700}}>
              Sign Out
            </button>
          </div>
        </Row>
      </Section>

      <Section title="Subscription">
        <ManageSubscription/>
      </Section>

      <Section title="Simulator & Replay">
        <Row label="Show TP/SL lines on Simulator" desc="Display TP and SL level lines while using the simulator">
          <button onClick={() => setSimShowLevels(!simShowLevels)} style={{ width:44, height:24, borderRadius:12, border:"none", cursor:"pointer", background: simShowLevels ? "#00e5ff" : "rgba(255,255,255,0.1)", position:"relative" as const, flexShrink:0, transition:"background 0.2s" }}>
            <div style={{ width:18, height:18, borderRadius:"50%", background:"#fff", position:"absolute" as const, top:3, left: simShowLevels ? 22 : 3, transition:"left 0.2s", boxShadow:"0 1px 4px rgba(0,0,0,0.4)" }}/>
          </button>
        </Row>
        <Row label="Show TP/SL lines on Replay" desc="Display TP and SL level lines on the trade chart replay">
          <button onClick={() => setReplayShowLevels(!replayShowLevels)} style={{ width:44, height:24, borderRadius:12, border:"none", cursor:"pointer", background: replayShowLevels ? "#00e5ff" : "rgba(255,255,255,0.1)", position:"relative" as const, flexShrink:0, transition:"background 0.2s" }}>
            <div style={{ width:18, height:18, borderRadius:"50%", background:"#fff", position:"absolute" as const, top:3, left: replayShowLevels ? 22 : 3, transition:"left 0.2s", boxShadow:"0 1px 4px rgba(0,0,0,0.4)" }}/>
          </button>
        </Row>
      </Section>

      <Section title="Appearance">
        <Row label="Theme" desc="Switch between dark and light mode">
          <div style={{display:"flex",gap:8}}>
            {(["dark","light"] as const).map(t=>(
              <button key={t} onClick={()=>setTheme(t)} style={{
                height:32,padding:"0 16px",borderRadius:8,border:"1px solid",
                borderColor:theme===t?"rgba(0,229,255,0.4)":"rgba(255,255,255,0.08)",
                background:theme===t?"rgba(0,229,255,0.1)":"rgba(255,255,255,0.04)",
                color:theme===t?"#00e5ff":"#6b7280",
                fontSize:12,fontWeight:700,cursor:"pointer",
              }}>{t==="dark"?"🌙 Dark":"☀️ Light"}</button>
            ))}
          </div>
        </Row>
      </Section>

      <Section title="Export Data">
        <Row label="Export as CSV" desc={`Download all ${allTrades.length} trades as a spreadsheet (Excel-compatible)`}>
          <ConfirmBtn label="Export CSV" confirmLabel="Click to confirm export" onConfirm={handleExportCSV} primary />
        </Row>
        <Row label="Export as JSON backup" desc="Full backup including all fields — can be restored later">
          <ConfirmBtn label="Export JSON" confirmLabel="Click to confirm export" onConfirm={handleExportJSON} />
        </Row>
      </Section>

      <Section title="Restore Data">
        <Row label="Restore from JSON backup" desc="Import a previously exported JSON backup file">
          <div>
            <input ref={jsonInputRef} type="file" accept=".json" style={{ display:"none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if(f) handleImportJSON(f); e.target.value=""; }}
            />
            <button onClick={() => jsonInputRef.current?.click()}
              style={{ height:32, padding:"0 14px", borderRadius:8, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.08)", color:"#d1d5db", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              Choose JSON file
            </button>
          </div>
        </Row>
      </Section>

      <Section title="Danger Zone">
        <Row label="Remove all closed trades" desc={`Delete ${allTrades.filter((t:any)=>t.status==="CLOSED").length} closed trades, keep ${allTrades.filter((t:any)=>t.status==="OPEN").length} open positions`}>
          <ConfirmBtn
            label="Remove closed trades"
            confirmLabel="Click again to confirm"
            onConfirm={() => { setAccountTrades(activeAccountId, allTrades.filter((t:any)=>t.status==="OPEN")); showToast(`✓ Removed closed trades`); }}
            danger
          />
        </Row>
        <Row label="Clear ALL trades" desc="Permanently delete all trades and data. Cannot be undone.">
          <ConfirmBtn
            label={`Clear all ${allTrades.length} trades`}
            confirmLabel="Permanently delete everything?"
            onConfirm={() => { handleClearAll(); }}
            danger
          />
        </Row>
        <Row label="Delete Account" desc="Permanently delete your account, all trades, and all data. This cannot be undone.">
          <ConfirmBtn
            label="Delete my account"
            confirmLabel="Yes, permanently delete everything"
            onConfirm={() => { handleDeleteAccount(); }}
            danger
          />
        </Row>
      </Section>

      <Section title="Futures Contract Specs">
        <p style={{ fontSize:12, color:"#6b7280", marginBottom:14, lineHeight:1.6 }}>
          P&L is auto-calculated using these multipliers. If your broker uses different specs,
          enter the P&L manually using the override field when adding a trade.
        </p>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
          {[
            ["ES","$50/pt"],["MES","$5/pt"],["NQ","$20/pt"],["MNQ","$2/pt"],
            ["YM","$5/pt"],["MYM","$0.50/pt"],["RTY","$50/pt"],["M2K","$5/pt"],
            ["CL","$1,000/pt"],["MCL","$100/pt"],["GC","$100/pt"],["MGC","$10/pt"],
            ["SI","$5,000/pt"],["NG","$10,000/pt"],["ZN","$1,000/pt"],["ZB","$1,000/pt"],
            ["6E","$125,000/pt"],["6B","$62,500/pt"],["6J","$12.5M/pt"],["6A","$100k/pt"],
          ].map(([sym,spec]) => (
            <div key={sym} style={{ padding:"8px 10px", borderRadius:7, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#f9fafb", fontFamily:"monospace" }}>{sym}</div>
              <div style={{ fontSize:10, color:"#4b5563", marginTop:1 }}>{spec}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:12, fontSize:11, color:"#374151" }}>
          Forex: 1 standard lot = 100,000 base currency units · Options: 1 contract = 100 shares
        </div>
      </Section>

      <Section title="About">
        <div style={{ fontSize:12, color:"#6b7280", lineHeight:1.8 }}>
          <div><strong style={{color:"#d1d5db"}}>TraderHub</strong> — Professional Trading Journal</div>
          <div>All data is stored locally in your browser. Nothing is sent to any server.</div>
          <div>Trades are automatically saved when you close or switch tabs.</div>
          <div style={{marginTop:8, color:"#374151"}}>Supports: Stocks · ETFs · Futures · Forex · Crypto · Options · CFDs</div>
        </div>
      </Section>

      {toast && (
        <div style={{
          position:"fixed", bottom:24, right:24,
          background: toast.type==="err" ? "#1f1215" : "#0f1a1f",
          border: `1px solid ${toast.type==="err" ? "rgba(248,113,113,0.3)" : "rgba(0,180,216,0.3)"}`,
          borderRadius:10, padding:"10px 18px",
          fontSize:13, color: toast.type==="err" ? "#f87171" : "#d1d5db",
          boxShadow:"0 8px 24px rgba(0,0,0,0.6)", zIndex:9999,
          animation:"fadeIn 0.2s ease",
        }}>
          {toast.msg}
        </div>
      )}
    </div>
    </>
  );
}
