"use client";
import { Trade } from "@/types/trade";

interface Props { trades: Trade[]; currentStreak: number; maxLoss: number; }

export function StreakWidget({ trades, currentStreak, maxLoss }: Props) {
  const isWin = currentStreak > 0;
  const abs = Math.abs(currentStreak);
  const color = isWin ? "#00e676" : "#ff1744";
  const warn = !isWin && abs >= 3;

  // Last 10 trades for dots
  const recent = [...trades]
    .filter(t => t.status === "CLOSED" && t.netPnl !== null)
    .sort((a, b) => new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime())
    .slice(0, 10).reverse();

  return (
    <div style={{
      background: warn ? "linear-gradient(160deg,rgba(255,23,68,0.08),#0b1017)" : "linear-gradient(160deg,#0f1520,#0b1017)",
      border: `1px solid ${warn ? "rgba(255,23,68,0.25)" : "rgba(255,255,255,0.07)"}`,
      borderRadius: 14, padding: "14px 16px",
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.09em", color: "#3d4551", marginBottom: 10 }}>Current Streak</div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 36, fontWeight: 900, fontFamily: "monospace", color, lineHeight: 1, textShadow: `0 0 20px ${color}50` }}>
          {isWin ? "+" : ""}{currentStreak}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color }}>
            {abs === 0 ? "No trades" : isWin ? `${abs} win${abs>1?"s":""} in a row` : `${abs} loss${abs>1?"es":""} in a row`}
          </div>
          {warn && <div style={{ fontSize: 11, color: "#ff1744", marginTop: 2 }}>Consider taking a break</div>}
        </div>
      </div>

      {/* Mini dots */}
      <div style={{ display: "flex", gap: 5 }}>
        {recent.map((t, i) => (
          <div key={i} style={{
            width: 10, height: 10, borderRadius: "50%",
            background: (t.netPnl||0) > 0 ? "#00e676" : "#ff1744",
            opacity: 0.4 + (i / recent.length) * 0.6,
            boxShadow: `0 0 4px ${(t.netPnl||0)>0?"rgba(0,230,118,0.5)":"rgba(255,23,68,0.5)"}`,
          }} title={`${t.ticker}: ${(t.netPnl||0)>=0?"+":""}$${(t.netPnl||0).toFixed(2)}`} />
        ))}
        {recent.length === 0 && <span style={{ fontSize: 11, color: "#3d4551" }}>No recent trades</span>}
      </div>
    </div>
  );
}
