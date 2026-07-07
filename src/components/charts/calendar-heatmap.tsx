"use client";
import { useMemo } from "react";
import { format, eachDayOfInterval, startOfYear, endOfYear, getDay } from "date-fns";

interface Props {
  data: Record<string, { pnl: number; count: number }>;
  year?: number;
}

export function CalendarHeatmap({ data, year = new Date().getFullYear() }: Props) {
  const days = useMemo(() => eachDayOfInterval({
    start: startOfYear(new Date(year, 0, 1)),
    end: endOfYear(new Date(year, 0, 1))
  }), [year]);

  const maxAbs = useMemo(() => Math.max(...Object.values(data).map(d => Math.abs(d.pnl)), 1), [data]);

  const color = (pnl: number) => {
    const intensity = Math.min(Math.abs(pnl) / maxAbs, 1);
    if (pnl > 0) {
      const a = 0.15 + intensity * 0.75;
      return `rgba(0,230,118,${a})`;
    }
    if (pnl < 0) {
      const a = 0.15 + intensity * 0.75;
      return `rgba(255,23,68,${a})`;
    }
    return "rgba(255,255,255,0.03)";
  };

  const border = (pnl: number) => {
    if (pnl > 0) return "rgba(0,230,118,0.3)";
    if (pnl < 0) return "rgba(255,23,68,0.2)";
    return "rgba(255,255,255,0.05)";
  };

  // Build week columns
  const weeks: (Date|null)[][] = [];
  let week: (Date|null)[] = Array(getDay(days[0])).fill(null);
  for (const d of days) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length) { while(week.length < 7) week.push(null); weeks.push(week); }

  const DAYS = ["S","M","T","W","T","F","S"];
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const fmt$ = (n: number) => {
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "+";
    if (abs >= 1000) return sign + "$" + (abs/1000).toFixed(1) + "k";
    return sign + "$" + abs.toFixed(0);
  };

  return (
    <div style={{ overflowX:"auto", paddingBottom:4 }}>
      {/* Month labels */}
      <div style={{ display:"flex", gap:2, marginLeft:18, marginBottom:4 }}>
        {MONTHS.map(m => <span key={m} style={{ flex:1, fontSize:9, color:"#3d4551", textAlign:"center" as const }}>{m}</span>)}
      </div>
      <div style={{ display:"flex", gap:2 }}>
        {/* Day labels */}
        <div style={{ display:"flex", flexDirection:"column", gap:2, marginRight:2 }}>
          {DAYS.map((d,i) => <span key={i} style={{ height:13, fontSize:8, color:"#3d4551", display:"flex", alignItems:"center" }}>{d}</span>)}
        </div>
        {/* Weeks */}
        {weeks.map((wk, wi) => (
          <div key={wi} style={{ display:"flex", flexDirection:"column", gap:2 }}>
            {wk.map((day, di) => {
              if (!day) return <div key={di} style={{ width:13, height:13 }}/>;
              const k = format(day, "yyyy-MM-dd");
              const d = data[k];
              const isToday = k === format(new Date(), "yyyy-MM-dd");
              return (
                <div key={di}
                  title={d
                    ? `${format(day,"MMM d")}: ${fmt$(d.pnl)} · ${d.count} trade${d.count>1?"s":""}`
                    : format(day,"MMM d")}
                  style={{
                    width:13, height:13, borderRadius:3, cursor:"default",
                    background: d ? color(d.pnl) : "rgba(255,255,255,0.025)",
                    border: `1px solid ${d ? border(d.pnl) : "rgba(255,255,255,0.04)"}`,
                    outline: isToday ? "1px solid rgba(0,229,255,0.6)" : "none",
                    outlineOffset: 1,
                    transition:"transform 0.1s",
                    boxShadow: d && Math.abs(d.pnl) > maxAbs * 0.7
                      ? d.pnl > 0 ? "0 0 6px rgba(0,230,118,0.4)" : "0 0 6px rgba(255,23,68,0.4)"
                      : "none",
                  }}
                  onMouseEnter={e=>(e.currentTarget as HTMLElement).style.transform="scale(1.4)"}
                  onMouseLeave={e=>(e.currentTarget as HTMLElement).style.transform="scale(1)"}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
