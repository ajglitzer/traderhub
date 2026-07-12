"use client";
import { useState } from "react";
import { useStore } from "@/store";
import { Trade } from "@/types/trade";
import { fmt$ } from "@/lib/utils";

interface Props { trades: Trade[]; }

export function GoalsWidget({ trades }: Props) {
  const { goals, setGoals } = useStore();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(goals);

  const today = new Date().toISOString().slice(0, 10);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  const todayTrades = trades.filter(t => t.entryTime?.slice(0, 10) === today && t.status === "CLOSED");
  const weekTrades  = trades.filter(t => t.entryTime?.slice(0, 10) >= weekStartStr && t.status === "CLOSED");

  const dayPnl  = todayTrades.reduce((a, t) => a + (t.netPnl || 0), 0);
  const weekPnl = weekTrades.reduce((a, t) => a + (t.netPnl || 0), 0);

  const dayProgress  = goals.dailyProfitTarget  > 0 ? Math.min(dayPnl  / goals.dailyProfitTarget,  1) : 0;
  const weekProgress = goals.weeklyProfitTarget > 0 ? Math.min(weekPnl / goals.weeklyProfitTarget, 1) : 0;
  const dayLossPct   = goals.dailyMaxLoss       > 0 ? Math.min(Math.abs(Math.min(dayPnl, 0)) / goals.dailyMaxLoss, 1) : 0;

  const atMaxLoss = dayPnl <= -goals.dailyMaxLoss;
  const nearMaxLoss = dayPnl <= -goals.dailyMaxLoss * 0.75;

  const Bar = ({ value, color, bg = "rgba(255,255,255,0.06)" }: { value: number; color: string; bg?: string }) => (
    <div style={{ height: 6, borderRadius: 3, background: bg, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.max(0, value * 100)}%`, background: color, borderRadius: 3, transition: "width 0.5s ease", boxShadow: `0 0 8px ${color}60` }} />
    </div>
  );

  return (
    <div style={{
      background: atMaxLoss ? "linear-gradient(160deg,rgba(255,23,68,0.12),rgba(11,16,23,0.95))" : "linear-gradient(160deg,#0f1520,#0b1017)",
      border: `1px solid ${atMaxLoss ? "rgba(255,23,68,0.4)" : nearMaxLoss ? "rgba(255,171,0,0.3)" : "rgba(255,255,255,0.07)"}`,
      borderRadius: 14, padding: "14px 16px",
      boxShadow: atMaxLoss ? "0 0 24px rgba(255,23,68,0.2)" : "none",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.09em", color: "#3d4551" }}>Daily Goals</span>
        <button onClick={() => setEditing(true)} style={{ fontSize: 10, color: "#4b5563", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Edit ✎</button>
      </div>

      {atMaxLoss && (
        <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(255,23,68,0.15)", border: "1px solid rgba(255,23,68,0.3)", marginBottom: 12, fontSize: 12, fontWeight: 700, color: "#ff1744", textAlign: "center" as const }}>
          🛑 MAX DAILY LOSS REACHED — STOP TRADING
        </div>
      )}
      {nearMaxLoss && !atMaxLoss && (
        <div style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(255,171,0,0.1)", border: "1px solid rgba(255,171,0,0.25)", marginBottom: 12, fontSize: 11, color: "#ffab00", textAlign: "center" as const }}>
          ⚠ Approaching max loss limit
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
        {/* Day P&L vs target */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: "#6b7280" }}>Today {fmt$(dayPnl)}</span>
            <span style={{ fontSize: 11, color: "#3d4551" }}>Target {fmt$(goals.dailyProfitTarget)}</span>
          </div>
          <Bar value={dayProgress} color={dayPnl >= 0 ? "#00e676" : "#ff1744"} />
        </div>

        {/* Max loss gauge */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: "#6b7280" }}>Max loss used {(dayLossPct * 100).toFixed(0)}%</span>
            <span style={{ fontSize: 11, color: "#3d4551" }}>Limit {fmt$(goals.dailyMaxLoss)}</span>
          </div>
          <Bar value={dayLossPct} color={dayLossPct > 0.75 ? "#ff1744" : "#ffab00"} />
        </div>

        {/* Week */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: "#6b7280" }}>Week {fmt$(weekPnl)}</span>
            <span style={{ fontSize: 11, color: "#3d4551" }}>Target {fmt$(goals.weeklyProfitTarget)}</span>
          </div>
          <Bar value={weekProgress} color="#00e5ff" />
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <div onClick={e => { if(e.target===e.currentTarget) setEditing(false); }} style={{ position:"fixed",inset:0,zIndex:9998,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center" }}>
          <div style={{ background:"#0f1520",border:"1px solid rgba(255,255,255,0.09)",borderRadius:16,padding:24,width:340 }}>
            <h3 style={{ fontSize:14,fontWeight:800,color:"#f0f6fc",marginBottom:16 }}>Edit Goals</h3>
            {([
              ["Daily Profit Target ($)", "dailyProfitTarget"],
              ["Daily Max Loss ($)", "dailyMaxLoss"],
              ["Weekly Profit Target ($)", "weeklyProfitTarget"],
            ] as [string, keyof typeof form][]).map(([label, key]) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: "#3d4551", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
                <input type="number" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: +e.target.value }))}
                  style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#d1d5db", fontSize: 13, padding: "8px 12px", outline: "none" }} />
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditing(false)} style={{ flex: 1, height: 34, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "#6b7280", cursor: "pointer", fontSize: 12 }}>Cancel</button>
              <button onClick={() => { setGoals(form); setEditing(false); }} style={{ flex: 1, height: 34, borderRadius: 8, border: "none", background: "linear-gradient(135deg,#00e5ff,#0088bb)", color: "#000", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
