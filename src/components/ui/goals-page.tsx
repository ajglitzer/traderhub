"use client";
import { useState, useMemo } from "react";
import { useStore } from "@/store";
import { useAccountStore } from "@/store/accounts";

export default function GoalsPage() {
  const { goals, setGoals } = useStore();
  const { getActiveTrades } = useAccountStore();
  const trades = getActiveTrades();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(goals);

  const today = new Date().toISOString().slice(0, 10);
  const thisWeek = useMemo(() => {
    const now = new Date();
    const start = new Date(now); start.setDate(now.getDate() - now.getDay());
    return start.toISOString().slice(0, 10);
  }, []);

  const todayPnl = useMemo(() => trades.filter(t => t.status === "CLOSED" && (t.entryTime || "").slice(0, 10) === today).reduce((s, t) => s + (t.netPnl ?? 0), 0), [trades, today]);
  const weekPnl  = useMemo(() => trades.filter(t => t.status === "CLOSED" && (t.entryTime || "").slice(0, 10) >= thisWeek).reduce((s, t) => s + (t.netPnl ?? 0), 0), [trades, thisWeek]);
  const todayLoss = Math.min(0, todayPnl);

  const save = () => { setGoals(form); setEditing(false); };

  const goals_data = [
    { label: "Daily Profit Target", current: todayPnl, target: goals.dailyProfitTarget, positive: true, prefix: "$" },
    { label: "Daily Max Loss", current: Math.abs(todayLoss), target: goals.dailyMaxLoss, positive: false, prefix: "$", inverse: true },
    { label: "Weekly Profit Target", current: weekPnl, target: goals.weeklyProfitTarget, positive: true, prefix: "$" },
  ];

  return (
    <div style={{ padding:20, overflowY:"auto", height:"100%", display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <h2 style={{ fontSize:16, fontWeight:800, color:"#f0f6fc", margin:0 }}>Goals</h2>
          <p style={{ fontSize:11, color:"#4b5563", margin:"2px 0 0" }}>Track daily and weekly performance targets</p>
        </div>
        <button onClick={() => setEditing(!editing)} style={{ height:32, padding:"0 16px", borderRadius:9, border:"1px solid rgba(0,229,255,0.2)", background:"rgba(0,229,255,0.06)", color:"#00e5ff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
          {editing ? "Cancel" : "✎ Edit Goals"}
        </button>
      </div>

      {editing && (
        <div style={{ background:"linear-gradient(160deg,#0f1520,#0b1017)", border:"1px solid rgba(0,229,255,0.15)", borderRadius:14, padding:18 }}>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {[
              { key:"dailyProfitTarget", label:"Daily Profit Target ($)" },
              { key:"dailyMaxLoss", label:"Daily Max Loss ($)" },
              { key:"weeklyProfitTarget", label:"Weekly Profit Target ($)" },
            ].map(({ key, label }) => (
              <div key={key}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.08em", color:"#4b5563", marginBottom:5 }}>{label}</div>
                <input type="number" value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: +e.target.value }))}
                  style={{ width:"100%", height:38, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:8, color:"#d1d5db", fontSize:13, padding:"0 12px", outline:"none", fontFamily:"inherit" }}/>
              </div>
            ))}
            <button onClick={save} style={{ height:38, borderRadius:9, border:"none", background:"linear-gradient(135deg,#00e5ff,#0088bb)", color:"#000", fontSize:13, fontWeight:800, cursor:"pointer" }}>Save Goals</button>
          </div>
        </div>
      )}

      {/* Progress bars */}
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {goals_data.map(g => {
          const pct = g.target > 0 ? Math.min(100, (Math.max(0, g.inverse ? g.current : g.current) / g.target) * 100) : 0;
          const hit = g.inverse ? g.current >= g.target : g.current >= g.target;
          const over = g.inverse && g.current > g.target;
          return (
            <div key={g.label} style={{ background:"linear-gradient(160deg,#0f1520,#0b1017)", border:`1px solid ${hit && !over ? "rgba(0,230,118,0.2)" : over ? "rgba(255,23,68,0.2)" : "rgba(255,255,255,0.07)"}`, borderRadius:14, padding:18 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:10 }}>
                <span style={{ fontSize:12, fontWeight:600, color:"#c9d1d9" }}>{g.label}</span>
                <span style={{ fontSize:11, color:"#4b5563" }}>
                  {g.prefix}{g.inverse ? g.current.toFixed(2) : Math.max(0, g.current).toFixed(2)} / {g.prefix}{g.target.toFixed(2)}
                </span>
              </div>
              <div style={{ height:8, background:"rgba(255,255,255,0.05)", borderRadius:4, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${pct}%`, borderRadius:4, transition:"width 0.4s ease", background: over ? "#ff1744" : hit ? "#00e676" : g.inverse ? "#ffab00" : "#00e5ff", boxShadow: hit && !over ? "0 0 8px rgba(0,230,118,0.5)" : "none" }}/>
              </div>
              <div style={{ fontSize:10, color: over ? "#ff1744" : hit ? "#00e676" : "#4b5563", marginTop:6, fontWeight:700 }}>
                {over ? "⚠️ Limit exceeded" : hit ? "✓ Target reached" : `${pct.toFixed(0)}% of target`}
              </div>
            </div>
          );
        })}
      </div>

      {/* Custom goals */}
      <div style={{ background:"linear-gradient(160deg,#0f1520,#0b1017)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:18 }}>
        <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.08em", color:"#4b5563", marginBottom:12 }}>Quick Stats</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
          {[
            { l:"Today's P&L", v:`${todayPnl >= 0 ? "+" : ""}$${todayPnl.toFixed(2)}`, c: todayPnl >= 0 ? "#00e676" : "#ff1744" },
            { l:"Week's P&L",  v:`${weekPnl >= 0 ? "+" : ""}$${weekPnl.toFixed(2)}`,   c: weekPnl >= 0 ? "#00e676" : "#ff1744" },
            { l:"Today's Trades", v:`${trades.filter(t => (t.entryTime||"").slice(0,10)===today).length}`, c:"#00e5ff" },
          ].map(s => (
            <div key={s.l} style={{ background:"rgba(255,255,255,0.02)", borderRadius:10, padding:"12px 14px", textAlign:"center" as const }}>
              <div style={{ fontSize:9, color:"#4b5563", textTransform:"uppercase" as const, letterSpacing:"0.06em", marginBottom:4 }}>{s.l}</div>
              <div style={{ fontSize:18, fontWeight:900, color:s.c, fontFamily:"monospace" }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
