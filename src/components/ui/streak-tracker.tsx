"use client";
import { useMemo } from "react";
import { useAccountStore } from "@/store/accounts";

export function StreakTracker() {
  const { getActiveTrades } = useAccountStore();
  const trades = getActiveTrades();

  const stats = useMemo(() => {
    const closed = trades.filter(t => t.status === "CLOSED" && t.netPnl != null)
      .sort((a, b) => new Date(a.entryTime || 0).getTime() - new Date(b.entryTime || 0).getTime());
    if (!closed.length) return null;

    // Current streak
    let streak = 0;
    const streakType = (closed[closed.length - 1].netPnl ?? 0) >= 0 ? "win" : "loss";
    for (let i = closed.length - 1; i >= 0; i--) {
      const isWin = (closed[i].netPnl ?? 0) >= 0;
      if ((streakType === "win" && isWin) || (streakType === "loss" && !isWin)) streak++;
      else break;
    }

    // Longest win streak
    let maxWin = 0, cur = 0;
    for (const t of closed) {
      if ((t.netPnl ?? 0) >= 0) { cur++; maxWin = Math.max(maxWin, cur); }
      else cur = 0;
    }

    // Green days
    const byDay: Record<string, number> = {};
    closed.forEach(t => {
      const d = (t.entryTime || "").slice(0, 10);
      byDay[d] = (byDay[d] || 0) + (t.netPnl ?? 0);
    });
    const days = Object.values(byDay);
    const greenDays = days.filter(p => p > 0).length;

    // Current day streak
    const sortedDays = Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0]));
    let dayStreak = 0;
    for (const [, pnl] of sortedDays) {
      if (pnl > 0) dayStreak++;
      else break;
    }

    // Last 10 trades
    const last10 = closed.slice(-10);

    return { streak, streakType, maxWin, greenDays, totalDays: days.length, dayStreak, last10 };
  }, [trades]);

  if (!stats) return null;

  return (
    <div style={{ background:"linear-gradient(160deg,#0f1520,#0b1017)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:18 }}>
      <div style={{ fontSize:10,fontWeight:700,textTransform:"uppercase" as const,letterSpacing:"0.08em",color:"#4b5563",marginBottom:14 }}>Streak Tracker</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:14 }}>
        {[
          { label:"Current Streak", value: `${stats.streakType === "win" ? "🔥" : "❄️"} ${stats.streak}`, sub: stats.streakType === "win" ? "wins in a row" : "losses in a row", color: stats.streakType === "win" ? "#00e676" : "#ff1744" },
          { label:"Longest Win Streak", value: `${stats.maxWin}`, sub: "consecutive wins", color: "#00e5ff" },
          { label:"Green Day Streak", value: `${stats.dayStreak}`, sub: `${stats.greenDays}/${stats.totalDays} green days`, color: "#ffab00" },
        ].map(s => (
          <div key={s.label} style={{ background:"rgba(255,255,255,0.02)", borderRadius:10, padding:"12px 14px", textAlign:"center" as const }}>
            <div style={{ fontSize:9, color:"#4b5563", textTransform:"uppercase" as const, letterSpacing:"0.06em", marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:24, fontWeight:900, color:s.color, fontFamily:"monospace" }}>{s.value}</div>
            <div style={{ fontSize:10, color:"#4b5563", marginTop:2 }}>{s.sub}</div>
          </div>
        ))}
      </div>
      {/* Last 10 trades dots */}
      <div>
        <div style={{ fontSize:10, color:"#4b5563", marginBottom:6 }}>Last {stats.last10.length} trades</div>
        <div style={{ display:"flex", gap:6 }}>
          {stats.last10.map((t, i) => {
            const w = (t.netPnl ?? 0) >= 0;
            return (
              <div key={i} title={`${w ? "Win" : "Loss"}: $${(t.netPnl ?? 0).toFixed(2)}`} style={{ width:28, height:28, borderRadius:"50%", background: w ? "rgba(0,230,118,0.2)" : "rgba(255,23,68,0.2)", border:`2px solid ${w ? "#00e676" : "#ff1744"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color: w ? "#00e676" : "#ff1744", fontWeight:800 }}>
                {w ? "W" : "L"}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
