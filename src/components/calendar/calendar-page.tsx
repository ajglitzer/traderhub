"use client";
import { useMemo, useState } from "react";
import { useAccountStore } from "@/store/accounts";
import { Trade } from "@/types/trade";
import {
  startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek,
  format, isSameMonth, isSameDay, addMonths, subMonths, getDay
} from "date-fns";

function fmt$(n: number, compact = false): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "+";
  if (compact && abs >= 1000) return sign + "$" + (abs/1000).toFixed(1) + "k";
  return sign + "$" + abs.toFixed(2);
}

function fmtPct(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export default function CalendarPage() {
  const { getActiveTrades } = useAccountStore();
  const trades = getActiveTrades();
  const [month, setMonth] = useState(new Date());

  const closed = useMemo(() =>
    trades.filter(t => t.status === "CLOSED" && t.netPnl !== null) as Trade[],
    [trades]
  );

  // Build day-level data
  const byDay = useMemo(() => {
    const m: Record<string, { pnl: number; count: number; wins: number; losses: number; gross: number }> = {};
    for (const t of closed) {
      const k = new Date(t.entryTime).toISOString().slice(0, 10);
      if (!m[k]) m[k] = { pnl: 0, count: 0, wins: 0, losses: 0, gross: 0 };
      m[k].pnl += t.netPnl!;
      m[k].gross += t.grossPnl ?? 0;
      m[k].count++;
      if (t.netPnl! > 0) m[k].wins++; else m[k].losses++;
    }
    return m;
  }, [closed]);

  // Monthly stats
  const monthStats = useMemo(() => {
    const monthDays = Object.entries(byDay).filter(([k]) => {
      const d = new Date(k);
      return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
    });
    const pnl = monthDays.reduce((a, [, v]) => a + v.pnl, 0);
    const trades = monthDays.reduce((a, [, v]) => a + v.count, 0);
    const winDays = monthDays.filter(([, v]) => v.pnl > 0).length;
    const lossDays = monthDays.filter(([, v]) => v.pnl < 0).length;
    return { pnl, trades, winDays, lossDays, tradingDays: monthDays.length };
  }, [byDay, month]);

  // All-time running balance (for % calc)
  const totalPnl = useMemo(() => closed.reduce((a, t) => a + t.netPnl!, 0), [closed]);

  // Calendar grid
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month));
    const end = endOfWeek(endOfMonth(month));
    return eachDayOfInterval({ start, end });
  }, [month]);

  const maxAbsDay = useMemo(() => {
    const vals = Object.values(byDay).map(d => Math.abs(d.pnl));
    return Math.max(...vals, 1);
  }, [byDay]);

  const today = new Date();

  return (
    <div style={{ padding:20, overflowY:"auto", height:"100%", display:"flex", flexDirection:"column", gap:14 }}>

      {/* -- Month header + stats -- */}
      <div style={{ background:"linear-gradient(160deg,#0f1520,#0b1017)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:"18px 22px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          {/* Month nav */}
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <button onClick={() => setMonth(subMonths(month, 1))} style={{ width:32, height:32, borderRadius:9, border:"1px solid rgba(255,255,255,0.08)", background:"rgba(255,255,255,0.04)", color:"#6b7280", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
            <h2 style={{ fontSize:18, fontWeight:800, color:"#f0f6fc", letterSpacing:"-0.03em", minWidth:180, textAlign:"center" as const }}>
              {format(month, "MMMM yyyy")}
            </h2>
            <button onClick={() => setMonth(addMonths(month, 1))} style={{ width:32, height:32, borderRadius:9, border:"1px solid rgba(255,255,255,0.08)", background:"rgba(255,255,255,0.04)", color:"#6b7280", cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
            <button onClick={() => setMonth(new Date())} style={{ height:28, padding:"0 12px", borderRadius:7, border:"1px solid rgba(0,229,255,0.2)", background:"rgba(0,229,255,0.06)", color:"#00e5ff", cursor:"pointer", fontSize:11, fontWeight:700 }}>Today</button>
          </div>

          {/* Month P&L */}
          <div style={{ textAlign:"right" as const }}>
            <div style={{ fontSize:10, color:"#3d4551", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:3 }}>Month P&L</div>
            <div style={{ fontSize:28, fontWeight:900, fontFamily:"monospace", letterSpacing:"-0.04em",
              color: monthStats.pnl >= 0 ? "#00e676" : "#ff1744",
              textShadow: monthStats.pnl >= 0 ? "0 0 30px rgba(0,230,118,0.4)" : "0 0 30px rgba(255,23,68,0.4)" }}>
              {fmt$(monthStats.pnl)}
            </div>
          </div>
        </div>

        {/* Month stat strip */}
        <div style={{ display:"flex", gap:0, borderRadius:10, overflow:"hidden", border:"1px solid rgba(255,255,255,0.06)" }}>
          {[
            { label:"Trades",      value: String(monthStats.trades),                 color:"#c9d1d9" },
            { label:"Trading Days",value: String(monthStats.tradingDays),            color:"#c9d1d9" },
            { label:"Win Days",    value: String(monthStats.winDays),                color:"#00e676" },
            { label:"Loss Days",   value: String(monthStats.lossDays),               color:"#ff1744" },
            { label:"Win Day %",   value: monthStats.tradingDays > 0 ? (monthStats.winDays/monthStats.tradingDays*100).toFixed(0)+"%" : "—", color:"#00e676" },
          ].map(({ label, value, color }, i) => (
            <div key={label} style={{ flex:1, padding:"10px 0", textAlign:"center" as const, borderRight: i < 4 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
              <div style={{ fontSize:9, color:"#3d4551", textTransform:"uppercase" as const, letterSpacing:"0.07em", marginBottom:4 }}>{label}</div>
              <div style={{ fontSize:16, fontWeight:800, fontFamily:"monospace", color }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* -- Calendar grid -- */}
      <div style={{ background:"linear-gradient(160deg,#0f1520,#0b1017)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:16, flex:1 }}>
        {/* Day headers */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:6 }}>
          {DAYS.map(d => (
            <div key={d} style={{ textAlign:"center" as const, fontSize:10, fontWeight:700, color:"#3d4551", textTransform:"uppercase" as const, letterSpacing:"0.08em", padding:"4px 0" }}>{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 }}>
          {days.map((day) => {
            const k = format(day, "yyyy-MM-dd");
            const d = byDay[k];
            const inMonth = isSameMonth(day, month);
            const isToday = isSameDay(day, today);
            const hasTrades = !!d && inMonth;
            const pnl = d?.pnl ?? 0;
            const isWin = pnl > 0;

            // Color intensity based on magnitude
            const intensity = hasTrades ? Math.min(Math.abs(pnl) / maxAbsDay, 1) : 0;
            const bg = hasTrades
              ? isWin
                ? `rgba(0,230,118,${0.06 + intensity * 0.2})`
                : `rgba(255,23,68,${0.06 + intensity * 0.2})`
              : "rgba(255,255,255,0.015)";
            const borderColor = hasTrades
              ? isWin ? `rgba(0,230,118,${0.2 + intensity * 0.5})` : `rgba(255,23,68,${0.2 + intensity * 0.5})`
              : isToday ? "rgba(0,229,255,0.5)" : "rgba(255,255,255,0.05)";

            return (
              <div key={k} style={{
                borderRadius:10, padding:"8px 10px", minHeight:72,
                background: bg,
                border: `1px solid ${borderColor}`,
                opacity: inMonth ? 1 : 0.2,
                position:"relative" as const,
                boxShadow: hasTrades && intensity > 0.5
                  ? isWin ? "0 0 12px rgba(0,230,118,0.15)" : "0 0 12px rgba(255,23,68,0.15)"
                  : "none",
                outline: isToday ? "2px solid rgba(0,229,255,0.5)" : "none",
                outlineOffset: 1,
              }}>
                {/* Date number */}
                <div style={{ fontSize:11, fontWeight: isToday ? 800 : 500, color: isToday ? "#00e5ff" : inMonth ? "#6b7280" : "#3d4551", marginBottom:4 }}>
                  {format(day, "d")}
                </div>

                {hasTrades && (
                  <>
                    {/* P&L */}
                    <div style={{ fontSize:12, fontWeight:800, fontFamily:"monospace", letterSpacing:"-0.02em",
                      color: isWin ? "#00e676" : "#ff1744",
                      textShadow: isWin ? "0 0 10px rgba(0,230,118,0.4)" : "0 0 10px rgba(255,23,68,0.4)" }}>
                      {fmt$(pnl, true)}
                    </div>

                    {/* Trade count + win/loss */}
                    <div style={{ fontSize:9, color:"#4b5563", marginTop:3 }}>
                      {d.count} trade{d.count !== 1 ? "s" : ""} · {d.wins}W {d.losses}L
                    </div>

                    {/* Win rate bar */}
                    {d.count > 0 && (
                      <div style={{ marginTop:5, height:2, borderRadius:1, background:"rgba(255,255,255,0.08)", overflow:"hidden" }}>
                        <div style={{ height:"100%", borderRadius:1, background: isWin ? "#00e676" : "#ff1744", width:`${(d.wins/d.count)*100}%`, opacity:0.8 }}/>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* -- Legend -- */}
      <div style={{ display:"flex", alignItems:"center", gap:20, fontSize:10, color:"#3d4551" }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div style={{ width:12, height:12, borderRadius:3, background:"rgba(0,230,118,0.25)", border:"1px solid rgba(0,230,118,0.4)" }}/>
          Profit day
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div style={{ width:12, height:12, borderRadius:3, background:"rgba(255,23,68,0.2)", border:"1px solid rgba(255,23,68,0.3)" }}/>
          Loss day
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div style={{ width:12, height:12, borderRadius:3, background:"rgba(255,255,255,0.015)", border:"1px solid rgba(255,255,255,0.05)" }}/>
          No trades
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div style={{ width:12, height:12, borderRadius:3, border:"2px solid rgba(0,229,255,0.5)" }}/>
          Today
        </div>
        <span style={{ marginLeft:8 }}>Darker = larger P&L magnitude</span>
      </div>
    </div>
  );
}
