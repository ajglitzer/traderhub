"use client";
import { scopedKey } from "@/lib/user-storage";
import { useState, useEffect } from "react";
import { useAccountStore } from "@/store/accounts";

interface DayLog {
  date: string;
  heartRate: number | null;
  sleep: number | null;
  focus: number | null;
  screenTime: number | null;
  morningRoutine: boolean;
  notes: string;
}

const LS_KEY_BASE = "tv_lifestyle_logs";

function loadLogs(): DayLog[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(scopedKey(LS_KEY_BASE)) || "[]"); } catch { return []; }
}
function saveLogs(logs: DayLog[]) {
  localStorage.setItem(scopedKey(LS_KEY_BASE), JSON.stringify(logs));
}

const TODAY = () => new Date().toISOString().slice(0, 10);

function StatCard({ label, value, sub, color = "#c9d1d9" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background:"#0e1117", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12, padding:"14px 16px" }}>
      <div style={{ fontSize:9, color:"#4b5563", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:900, fontFamily:"monospace", color }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:"#374151", marginTop:3 }}>{sub}</div>}
    </div>
  );
}

function Slider({ label, value, onChange, min, max, step=1, color="#00e5ff", unit="" }: any) {
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
        <span style={{ fontSize:11, color:"#6b7280" }}>{label}</span>
        <span style={{ fontSize:12, fontWeight:700, fontFamily:"monospace", color }}>{value ?? "—"}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value ?? min}
        onChange={e => onChange(+e.target.value)}
        style={{ width:"100%", accentColor:color, height:4 }}/>
    </div>
  );
}

export default function LifestylePage() {
  const { getActiveTrades } = useAccountStore();
  const trades = getActiveTrades();
  const [logs, setLogs] = useState<DayLog[]>([]);
  const [today, setToday] = useState<DayLog>({ date:TODAY(), heartRate:null, sleep:null, focus:null, screenTime:null, morningRoutine:false, notes:"" });
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<"log"|"analytics">("log");

  useEffect(() => {
    const all = loadLogs();
    setLogs(all);
    const tod = all.find(l => l.date === TODAY());
    if (tod) setToday(tod);
  }, []);

  const save = () => {
    const all = loadLogs().filter(l => l.date !== today.date);
    const updated = [...all, today].sort((a,b) => a.date.localeCompare(b.date));
    saveLogs(updated); setLogs(updated); setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  // Correlate lifestyle metrics with P&L
  const correlation = logs.map(log => {
    const dayTrades = trades.filter(t => t.entryTime?.slice(0,10) === log.date && t.status === "CLOSED");
    const pnl = dayTrades.reduce((a,t) => a + (t.netPnl||0), 0);
    return { ...log, pnl, tradeCount: dayTrades.length };
  }).filter(l => l.tradeCount > 0);

  const avgByFocus = [1,2,3,4,5].map(f => {
    const days = correlation.filter(l => l.focus === f);
    return { focus: f, avgPnl: days.length ? days.reduce((a,l) => a+l.pnl, 0)/days.length : null, count: days.length };
  });

  const avgBySleep = ["<6h","6-7h","7-8h","8+h"].map((label,i) => {
    const ranges = [[0,6],[6,7],[7,8],[8,24]];
    const [lo,hi] = ranges[i];
    const days = correlation.filter(l => l.sleep !== null && l.sleep >= lo && l.sleep < hi);
    return { label, avgPnl: days.length ? days.reduce((a,l) => a+l.pnl, 0)/days.length : null, count: days.length };
  });

  const morningRoutineDays = correlation.filter(l => l.morningRoutine);
  const noRoutineDays = correlation.filter(l => !l.morningRoutine);
  const mrAvg = morningRoutineDays.length ? morningRoutineDays.reduce((a,l) => a+l.pnl, 0)/morningRoutineDays.length : null;
  const noMrAvg = noRoutineDays.length ? noRoutineDays.reduce((a,l) => a+l.pnl, 0)/noRoutineDays.length : null;

  const IS = { width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:8, color:"#d1d5db", fontSize:13, padding:"8px 12px", outline:"none", fontFamily:"inherit" } as const;

  return (
    <div style={{ padding:20, overflowY:"auto", height:"100%", display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <h2 style={{ fontSize:16, fontWeight:800, color:"#f0f6fc" }}>Behavioral & Lifestyle Tracker</h2>
          <p style={{ fontSize:11, color:"#4b5563", marginTop:2 }}>Track sleep, focus, and physical state to find correlations with your trading performance</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {(["log","analytics"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              height:32, padding:"0 16px", borderRadius:9, border:"1px solid",
              borderColor:tab===t?"rgba(0,229,255,0.4)":"rgba(255,255,255,0.08)",
              background:tab===t?"rgba(0,229,255,0.1)":"rgba(255,255,255,0.04)",
              color:tab===t?"#00e5ff":"#6b7280", fontSize:12, fontWeight:700, cursor:"pointer",
            }}>{t === "log" ? "📝 Today's Log" : "📊 Analytics"}</button>
          ))}
        </div>
      </div>

      {tab === "log" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
          {/* Biometrics */}
          <div style={{ background:"linear-gradient(160deg,#0f1520,#0b1017)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:18, display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.08em", color:"#3d4551" }}>Physical Biometrics</div>

            <Slider label="Resting Heart Rate (bpm)" value={today.heartRate} onChange={(v:number) => setToday(t => ({...t, heartRate:v}))}
              min={40} max={120} color={today.heartRate && today.heartRate > 80 ? "#ff1744" : "#00e676"} unit=" bpm"/>

            <Slider label="Hours of Sleep" value={today.sleep} onChange={(v:number) => setToday(t => ({...t, sleep:v}))}
              min={0} max={12} step={0.5} color={today.sleep && today.sleep < 6 ? "#ff1744" : today.sleep && today.sleep < 7 ? "#ffab00" : "#00e676"} unit="h"/>

            <Slider label="Focus Level (1-5)" value={today.focus} onChange={(v:number) => setToday(t => ({...t, focus:v}))}
              min={1} max={5} color={today.focus && today.focus <= 2 ? "#ff1744" : today.focus && today.focus <= 3 ? "#ffab00" : "#00e676"}/>

            <Slider label="Hours on Charts (Screen Time)" value={today.screenTime} onChange={(v:number) => setToday(t => ({...t, screenTime:v}))}
              min={0} max={12} step={0.5} color={today.screenTime && today.screenTime > 6 ? "#ff1744" : "#00e5ff"} unit="h"/>
          </div>

          {/* Routine + notes */}
          <div style={{ background:"linear-gradient(160deg,#0f1520,#0b1017)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:18, display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.08em", color:"#3d4551" }}>Pre-Market Routine</div>

            <div onClick={() => setToday(t => ({...t, morningRoutine:!t.morningRoutine}))} style={{
              display:"flex", alignItems:"center", gap:14, padding:"14px 16px", borderRadius:10, cursor:"pointer",
              background: today.morningRoutine ? "rgba(0,230,118,0.08)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${today.morningRoutine ? "rgba(0,230,118,0.25)" : "rgba(255,255,255,0.06)"}`,
              transition:"all 0.15s",
            }}>
              <div style={{ width:28, height:28, borderRadius:8, border:`2px solid ${today.morningRoutine?"#00e676":"rgba(255,255,255,0.15)"}`, background:today.morningRoutine?"#00e676":"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                {today.morningRoutine && <span style={{ color:"#000", fontSize:16, fontWeight:900 }}>✓</span>}
              </div>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color: today.morningRoutine ? "#00e676" : "#6b7280" }}>
                  {today.morningRoutine ? "Morning Routine Completed ✅" : "Morning Routine Not Completed"}
                </div>
                <div style={{ fontSize:11, color:"#374151", marginTop:2 }}>
                  Did you complete your full pre-market analysis before open?
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontSize:9, color:"#4b5563", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:6 }}>Daily Notes</div>
              <textarea value={today.notes} onChange={e => setToday(t => ({...t, notes:e.target.value}))}
                rows={5} placeholder="How are you feeling today? Any external stressors? Market conditions?"
                style={{...IS, resize:"vertical" as const}}/>
            </div>

            {/* Alerts */}
            {today.sleep !== null && today.sleep < 6 && (
              <div style={{ padding:"10px 14px", borderRadius:9, background:"rgba(255,23,68,0.08)", border:"1px solid rgba(255,23,68,0.2)", fontSize:12, color:"#f87171" }}>
                ⚠️ Under 6 hours sleep — higher risk of breaking risk rules. Consider reducing position size today.
              </div>
            )}
            {today.focus !== null && today.focus <= 2 && (
              <div style={{ padding:"10px 14px", borderRadius:9, background:"rgba(255,171,0,0.08)", border:"1px solid rgba(255,171,0,0.2)", fontSize:12, color:"#ffab00" }}>
                ⚠️ Low focus level — avoid scalping, stick to higher timeframe setups only.
              </div>
            )}
            {today.screenTime !== null && today.screenTime > 5 && (
              <div style={{ padding:"10px 14px", borderRadius:9, background:"rgba(255,171,0,0.08)", border:"1px solid rgba(255,171,0,0.2)", fontSize:12, color:"#ffab00" }}>
                ⚠️ {today.screenTime}h on charts — fatigue risk. Take a 20-min break before your next trade.
              </div>
            )}

            <button onClick={save} style={{ height:36, borderRadius:10, border:"none", background:saved?"rgba(0,230,118,0.15)":"linear-gradient(135deg,#00e5ff,#0088bb)", color:saved?"#00e676":"#000", cursor:"pointer", fontSize:13, fontWeight:800, transition:"all 0.2s" }}>
              {saved ? "✓ Saved" : "Save Today's Log"}
            </button>
          </div>
        </div>
      )}

      {tab === "analytics" && (
        <>
          {correlation.length === 0 ? (
            <div style={{ background:"linear-gradient(160deg,#0f1520,#0b1017)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:48, textAlign:"center" as const }}>
              <div style={{ fontSize:32, marginBottom:12 }}>📊</div>
              <div style={{ fontSize:14, fontWeight:700, color:"#f0f6fc", marginBottom:8 }}>No correlation data yet</div>
              <div style={{ fontSize:12, color:"#4b5563" }}>Log your biometrics daily for 2+ weeks to see correlations with your P&L</div>
            </div>
          ) : (
            <>
              {/* Morning routine correlation */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                <StatCard label="Avg P&L w/ Morning Routine" value={mrAvg !== null ? `$${mrAvg.toFixed(2)}` : "—"} color={mrAvg !== null && mrAvg >= 0 ? "#00e676" : "#ff1744"} sub={`${morningRoutineDays.length} days`}/>
                <StatCard label="Avg P&L w/o Morning Routine" value={noMrAvg !== null ? `$${noMrAvg.toFixed(2)}` : "—"} color={noMrAvg !== null && noMrAvg >= 0 ? "#00e676" : "#ff1744"} sub={`${noRoutineDays.length} days`}/>
                <StatCard label="Routine Advantage" value={mrAvg !== null && noMrAvg !== null ? `$${(mrAvg-noMrAvg).toFixed(2)}` : "—"} color="#ffab00" sub="per day"/>
              </div>

              {/* Focus vs P&L */}
              <div style={{ background:"linear-gradient(160deg,#0f1520,#0b1017)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:18 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.08em", color:"#4b5563", marginBottom:14 }}>Avg P&L by Focus Level</div>
                <div style={{ display:"flex", gap:10 }}>
                  {avgByFocus.map(f => (
                    <div key={f.focus} style={{ flex:1, textAlign:"center" as const }}>
                      <div style={{ fontSize:9, color:"#4b5563", marginBottom:6 }}>Focus {f.focus}</div>
                      <div style={{ height:80, display:"flex", alignItems:"flex-end", justifyContent:"center", background:"rgba(255,255,255,0.02)", borderRadius:6, padding:"4px 0" }}>
                        {f.avgPnl !== null && (
                          <div style={{ width:"70%", borderRadius:3, background:f.avgPnl>=0?"#00e676":"#ff1744", height:`${Math.min(Math.abs(f.avgPnl)/Math.max(...avgByFocus.filter(x=>x.avgPnl!==null).map(x=>Math.abs(x.avgPnl!)),1)*70,70)}%`, minHeight:4, opacity:0.8 }}/>
                        )}
                      </div>
                      <div style={{ fontSize:10, fontWeight:700, fontFamily:"monospace", marginTop:5, color:f.avgPnl!==null?(f.avgPnl>=0?"#00e676":"#ff1744"):"#374151" }}>
                        {f.avgPnl !== null ? `$${f.avgPnl.toFixed(0)}` : "—"}
                      </div>
                      <div style={{ fontSize:9, color:"#374151" }}>{f.count}d</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sleep vs P&L */}
              <div style={{ background:"linear-gradient(160deg,#0f1520,#0b1017)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:18 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.08em", color:"#4b5563", marginBottom:14 }}>Avg P&L by Hours of Sleep</div>
                <div style={{ display:"flex", gap:10 }}>
                  {avgBySleep.map(s => (
                    <div key={s.label} style={{ flex:1, textAlign:"center" as const }}>
                      <div style={{ fontSize:10, color:"#4b5563", marginBottom:6 }}>{s.label}</div>
                      <div style={{ height:80, display:"flex", alignItems:"flex-end", justifyContent:"center", background:"rgba(255,255,255,0.02)", borderRadius:6, padding:"4px 0" }}>
                        {s.avgPnl !== null && (
                          <div style={{ width:"70%", borderRadius:3, background:s.avgPnl>=0?"#00e676":"#ff1744", height:`${Math.min(Math.abs(s.avgPnl)/Math.max(...avgBySleep.filter(x=>x.avgPnl!==null).map(x=>Math.abs(x.avgPnl!)),1)*70,70)}%`, minHeight:4, opacity:0.8 }}/>
                        )}
                      </div>
                      <div style={{ fontSize:10, fontWeight:700, fontFamily:"monospace", marginTop:5, color:s.avgPnl!==null?(s.avgPnl>=0?"#00e676":"#ff1744"):"#374151" }}>
                        {s.avgPnl !== null ? `$${s.avgPnl.toFixed(0)}` : "—"}
                      </div>
                      <div style={{ fontSize:9, color:"#374151" }}>{s.count}d</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Log history */}
              <div style={{ background:"linear-gradient(160deg,#0f1520,#0b1017)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:18 }}>
                <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.08em", color:"#4b5563", marginBottom:12 }}>Log History</div>
                <div style={{ display:"flex", flexDirection:"column" as const, gap:6, maxHeight:300, overflowY:"auto" }}>
                  {[...logs].reverse().slice(0,30).map(log => {
                    const dayPnl = correlation.find(c => c.date === log.date)?.pnl;
                    return (
                      <div key={log.date} style={{ display:"flex", alignItems:"center", gap:12, padding:"8px 10px", borderRadius:8, background:"rgba(255,255,255,0.02)", fontSize:11 }}>
                        <span style={{ color:"#4b5563", width:80, flexShrink:0 }}>{log.date}</span>
                        {log.sleep !== null && <span title="Sleep" style={{ color:"#00e5ff" }}>💤{log.sleep}h</span>}
                        {log.focus !== null && <span title="Focus" style={{ color:"#ffab00" }}>🎯{log.focus}/5</span>}
                        {log.heartRate !== null && <span title="Heart rate" style={{ color:"#ff6b35" }}>❤️{log.heartRate}</span>}
                        {log.morningRoutine && <span style={{ color:"#00e676" }}>✅</span>}
                        {dayPnl !== undefined && <span style={{ marginLeft:"auto", fontWeight:700, fontFamily:"monospace", color:dayPnl>=0?"#00e676":"#ff1744" }}>{dayPnl>=0?"+":""}${dayPnl.toFixed(2)}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
