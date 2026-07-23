"use client";
import { useState, useEffect } from "react";

interface CalEvent {
  title: string;
  country: string;
  date: string;
  time: string;
  impact: "High" | "Medium" | "Low";
  forecast: string;
  previous: string;
  actual: string;
}

const IMPACT_COLOR: Record<string,string> = { High:"#ff1744", Medium:"#ffab00", Low:"#4b5563" };
const IMPACT_BG:    Record<string,string> = { High:"rgba(255,23,68,0.1)", Medium:"rgba(255,171,0,0.1)", Low:"rgba(255,255,255,0.04)" };

async function fetchCalendar(): Promise<CalEvent[]> {
  try {
    const r = await fetch("/api/calendar");
    if (!r.ok) throw new Error("fetch failed");
    const data = await r.json();
    if (!Array.isArray(data)) throw new Error("bad data");
    return data;
  } catch { return []; }
}

function formatTime(t: string) {
  if (!t) return "All Day";
  return t;
}

function timeUntil(dateStr: string, timeStr: string): string | null {
  try {
    const dt = new Date(`${dateStr}T${timeStr || "00:00"}:00`);
    const diff = dt.getTime() - Date.now();
    if (diff < 0) return null;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h > 24) return null;
    if (h > 0) return `in ${h}h ${m}m`;
    return `in ${m}m`;
  } catch { return null; }
}

export default function EconomicCalendar() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"All"|"High"|"Medium"|"Low">("All");
  const [countryFilter, setCountryFilter] = useState("USD");
  const [, tick] = useState(0);

  useEffect(() => {
    fetchCalendar().then(e => { setEvents(e); setLoading(false); });
    const t = setInterval(() => tick(n => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const filtered = events.filter(e =>
    (filter === "All" || e.impact === filter) &&
    (countryFilter === "All" || e.country === countryFilter)
  );

  const todayEvents = filtered.filter(e => e.date === today);
  const upcomingEvents = filtered.filter(e => e.date > today).slice(0, 30);

  const nextHigh = events.find(e =>
    e.impact === "High" &&
    timeUntil(e.date, e.time) !== null
  );

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", gap:12 }}>
      <div style={{ width:32,height:32,borderRadius:"50%",border:"2px solid rgba(0,229,255,0.15)",borderTop:"2px solid #00e5ff",animation:"spin 0.8s linear infinite" }}/>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );

  return (
    <div style={{ padding:20, overflowY:"auto", height:"100%", display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
        <div>
          <h2 style={{ fontSize:16,fontWeight:800,color:"#f0f6fc",margin:0 }}>Economic Calendar</h2>
          <p style={{ fontSize:11,color:"#4b5563",margin:"2px 0 0" }}>Upcoming market-moving events</p>
        </div>
        {nextHigh && (
          <div style={{ padding:"6px 14px",borderRadius:20,background:"rgba(255,23,68,0.1)",border:"1px solid rgba(255,23,68,0.25)",fontSize:12,color:"#ff1744",fontWeight:700 }}>
            🔴 {nextHigh.title} {timeUntil(nextHigh.date, nextHigh.time)}
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {(["All","High","Medium","Low"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ height:28, padding:"0 14px", borderRadius:20, border:"1px solid", fontSize:11, fontWeight:700, cursor:"pointer", transition:"all 0.12s",
            borderColor: filter===f ? (IMPACT_COLOR[f]||"rgba(0,229,255,0.4)") : "rgba(255,255,255,0.08)",
            background:  filter===f ? (IMPACT_BG[f]||"rgba(0,229,255,0.1)") : "rgba(255,255,255,0.03)",
            color:       filter===f ? (IMPACT_COLOR[f]||"#00e5ff") : "#4b5563",
          }}>{f === "All" ? "All Impact" : `🔴 ${f}`.replace("🔴 Medium","🟡 Medium").replace("🔴 Low","⚪ Low")}</button>
        ))}
        <div style={{ minHeight:28, display:"flex", alignItems:"center", gap:6, marginLeft:"auto", flexWrap:"wrap" as const }}>
          <span style={{ fontSize:10,color:"#4b5563" }}>Currency:</span>
          {["USD","EUR","GBP","All"].map(c => (
            <button key={c} onClick={() => setCountryFilter(c)} style={{ height:26, padding:"0 10px", borderRadius:7, border:"1px solid", fontSize:10, fontWeight:700, cursor:"pointer",
              borderColor: countryFilter===c ? "rgba(0,229,255,0.3)" : "rgba(255,255,255,0.07)",
              background: countryFilter===c ? "rgba(0,229,255,0.08)" : "transparent",
              color: countryFilter===c ? "#00e5ff" : "#4b5563",
            }}>{c}</button>
          ))}
        </div>
      </div>

      {/* Today */}
      {todayEvents.length > 0 && (
        <div>
          <div style={{ fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"#4b5563",marginBottom:8 }}>Today · {new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {todayEvents.map((e, i) => <EventRow key={i} event={e}/>)}
          </div>
        </div>
      )}

      {todayEvents.length === 0 && (
        <div style={{ padding:"20px",background:"rgba(255,255,255,0.02)",borderRadius:12,border:"1px solid rgba(255,255,255,0.05)",textAlign:"center",color:"#4b5563",fontSize:13 }}>
          No {filter !== "All" ? filter.toLowerCase() + "-impact" : ""} events today{countryFilter !== "All" ? ` for ${countryFilter}` : ""}
        </div>
      )}

      {/* Upcoming */}
      {upcomingEvents.length > 0 && (
        <div>
          <div style={{ fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"#4b5563",marginBottom:8 }}>Upcoming This Week</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {upcomingEvents.map((e, i) => <EventRow key={i} event={e} showDate/>)}
          </div>
        </div>
      )}

      {!loading && events.length === 0 && (
        <div style={{ padding:24,textAlign:"center",color:"#4b5563" }}>
          <div style={{ fontSize:24,marginBottom:8 }}>📅</div>
          <div>Could not load calendar data</div>
          <div style={{ fontSize:11,marginTop:4 }}>Check your connection and try again</div>
        </div>
      )}
    </div>
  );
}

function EventRow({ event: e, showDate }: { event: CalEvent; showDate?: boolean }) {
  const countdown = timeUntil(e.date, e.time);
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:"linear-gradient(160deg,#0f1520,#0b1017)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:10, borderLeft:`3px solid ${IMPACT_COLOR[e.impact]}` }}>
      <div style={{ minWidth:54, textAlign:"center" }}>
        {showDate && <div style={{ fontSize:9, color:"#4b5563", marginBottom:1 }}>{new Date(e.date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div>}
        <div style={{ fontSize:11, fontWeight:700, color:"#8b949e", fontFamily:"monospace" }}>{formatTime(e.time)}</div>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:700, color:"#f0f6fc", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{e.title}</div>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:2 }}>
          <span style={{ fontSize:10, padding:"1px 7px", borderRadius:10, background:IMPACT_BG[e.impact], color:IMPACT_COLOR[e.impact], fontWeight:700 }}>{e.impact}</span>
          <span style={{ fontSize:10, color:"#4b5563" }}>{e.country}</span>
          {countdown && <span style={{ fontSize:10, color:"#ffab00", fontWeight:700 }}>{countdown}</span>}
        </div>
      </div>
      <div style={{ display:"flex", gap:12, fontSize:11, fontFamily:"monospace", flexShrink:0 }}>
        {e.forecast && <div style={{ textAlign:"center" }}><div style={{ fontSize:9, color:"#4b5563" }}>Forecast</div><div style={{ color:"#8b949e" }}>{e.forecast}</div></div>}
        {e.previous && <div style={{ textAlign:"center" }}><div style={{ fontSize:9, color:"#4b5563" }}>Previous</div><div style={{ color:"#8b949e" }}>{e.previous}</div></div>}
        {e.actual   && <div style={{ textAlign:"center" }}><div style={{ fontSize:9, color:"#4b5563" }}>Actual</div><div style={{ color: parseFloat(e.actual) >= parseFloat(e.forecast||"0") ? "#00e676" : "#ff1744", fontWeight:800 }}>{e.actual}</div></div>}
      </div>
    </div>
  );
}
