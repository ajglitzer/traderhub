"use client";
import { useState, useEffect } from "react";
import { useStore } from "@/store";
import { format } from "date-fns";

interface JournalEntry {
  id: string;
  date: string;
  content: string;
  mood: string;
  tags: string[];
}

const MOODS = [
  { v:"great", label:"Great", color:"#34d399" },
  { v:"good",  label:"Good",  color:"#60a5fa" },
  { v:"ok",    label:"OK",    color:"#fbbf24" },
  { v:"bad",   label:"Bad",   color:"#f87171" },
];

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem("tv_journal") || "[]"); } catch { return []; }
  });
  const [content, setContent] = useState("");
  const [mood, setMood] = useState("ok");
  const [view, setView] = useState<"write"|"history">("write");

  const { trades } = useStore();

  const mounted = typeof window !== "undefined";
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem("tv_journal", JSON.stringify(entries));
  }, [entries, mounted]);

  const save = () => {
    if (!content.trim()) return;
    const entry: JournalEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      content: content.trim(),
      mood,
      tags: [],
    };
    setEntries(prev => [entry, ...prev]);
    setContent("");
    setMood("ok");
    setView("history");
  };

  // Today stats
  const today = new Date().toISOString().slice(0,10);
  const todayTrades = trades.filter(t => t.entryTime?.slice(0,10) === today && t.status === "CLOSED");
  const todayPnl = todayTrades.reduce((a,t) => a + (t.netPnl||0), 0);

  return (
    <div style={{ padding:20, overflowY:"auto", height:"100%", display:"flex", flexDirection:"column", gap:14, maxWidth:760 }}>
      {/* Today summary */}
      <div style={{ background:"#0e1117", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12, padding:"14px 18px", display:"flex", gap:24 }}>
        <div>
          <div style={{ fontSize:10, color:"#4b5563", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:3 }}>Today</div>
          <div style={{ fontSize:13, color:"#d1d5db" }}>{format(new Date(), "EEEE, MMMM d")}</div>
        </div>
        <div>
          <div style={{ fontSize:10, color:"#4b5563", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:3 }}>Trades today</div>
          <div style={{ fontSize:13, color:"#d1d5db" }}>{todayTrades.length}</div>
        </div>
        <div>
          <div style={{ fontSize:10, color:"#4b5563", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:3 }}>P&L today</div>
          <div style={{ fontSize:13, fontFamily:"monospace", fontWeight:700, color:todayPnl>=0?"#34d399":"#f87171" }}>
            {todayPnl>=0?"+":""}{todayPnl.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:8 }}>
        {(["write","history"] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{ height:32, padding:"0 16px", borderRadius:8, border:"1px solid", fontSize:12, fontWeight:600, cursor:"pointer", background:view===v?"rgba(0,180,216,0.12)":"transparent", borderColor:view===v?"rgba(0,180,216,0.3)":"rgba(255,255,255,0.07)", color:view===v?"#00b4d8":"#6b7280" }}>
            {v === "write" ? "Write Entry" : `History (${entries.length})`}
          </button>
        ))}
      </div>

      {view === "write" && (
        <div style={{ background:"#0e1117", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12, padding:18 }}>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, color:"#4b5563", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:8 }}>How did trading go today?</div>
            <div style={{ display:"flex", gap:8 }}>
              {MOODS.map(m => (
                <button key={m.v} onClick={() => setMood(m.v)} style={{ height:30, padding:"0 12px", borderRadius:8, border:"1px solid", fontSize:12, fontWeight:600, cursor:"pointer", background:mood===m.v?`${m.color}18`:"transparent", borderColor:mood===m.v?m.color:"rgba(255,255,255,0.07)", color:mood===m.v?m.color:"#6b7280" }}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What happened today? What trades did you take? What did you learn? What mistakes did you make? Be honest with yourself."
            style={{ width:"100%", height:200, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:10, padding:14, color:"#d1d5db", fontSize:13, resize:"vertical", outline:"none", lineHeight:1.7 }}
          />
          <div style={{ marginTop:10, display:"flex", justifyContent:"flex-end", gap:8 }}>
            <button onClick={save} disabled={!content.trim()} style={{ height:34, padding:"0 20px", borderRadius:9, background:"#00b4d8", border:"none", color:"#000", fontSize:13, fontWeight:700, cursor:content.trim()?"pointer":"default", opacity:content.trim()?1:0.4 }}>
              Save Entry
            </button>
          </div>
        </div>
      )}

      {view === "history" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {entries.length === 0 ? (
            <div style={{ textAlign:"center" as const, padding:"48px 0", color:"#374151", fontSize:13 }}>
              No entries yet. Write your first journal entry.
            </div>
          ) : entries.map(e => {
            const moodDef = MOODS.find(m=>m.v===e.mood);
            return (
              <div key={e.id} style={{ background:"#0e1117", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12, padding:"14px 18px" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                  <span style={{ fontSize:12, color:"#6b7280" }}>{format(new Date(e.date), "EEEE, MMMM d, yyyy — h:mm a")}</span>
                  {moodDef && <span style={{ fontSize:11, fontWeight:600, color:moodDef.color, padding:"2px 8px", borderRadius:20, background:`${moodDef.color}12`, border:`1px solid ${moodDef.color}30` }}>{moodDef.label}</span>}
                </div>
                <p style={{ fontSize:13, color:"#d1d5db", lineHeight:1.7, whiteSpace:"pre-wrap" as const }}>{e.content}</p>
                <button onClick={() => setEntries(prev => prev.filter(x=>x.id!==e.id))} style={{ marginTop:10, padding:"3px 10px", borderRadius:6, background:"transparent", border:"1px solid rgba(248,113,113,0.15)", color:"#f87171", fontSize:11, cursor:"pointer" }}>Delete</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Daily Prompts */}
      <DailyPrompts/>
    </div>
  );
}

const PROMPTS = [
  "What was your best trade today and why did you take it?",
  "Did you follow your trading rules on every trade?",
  "What emotion did you feel most strongly during trading today?",
  "Was there a trade you hesitated on? What held you back?",
  "If you could redo one trade today, which would it be and why?",
  "Did you stick to your position sizing rules?",
  "What market conditions affected your performance today?",
  "Were you patient or did you force trades?",
  "What's one thing you'll do differently tomorrow?",
  "Rate your discipline today from 1-10 and explain why.",
];

function DailyPrompts() {
  const [answers, setAnswers] = useState<Record<number,string>>({});
  const [saved, setSaved] = useState(false);
  const today = new Date().toISOString().slice(0,10);

  useEffect(() => {
    try { const s = localStorage.getItem(`th_journal_prompts_${today}`); if (s) setAnswers(JSON.parse(s)); } catch {}
  }, [today]);

  const save = () => {
    localStorage.setItem(`th_journal_prompts_${today}`, JSON.stringify(answers));
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ background:"linear-gradient(160deg,#0f1520,#0b1017)", border:"1px solid rgba(255,171,0,0.15)", borderRadius:14, padding:18, marginTop:4 }}>
      <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.08em", color:"#ffab00", marginBottom:14 }}>Journal Prompts</div>
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {PROMPTS.map((p, i) => (
          <div key={i}>
            <div style={{ fontSize:12, color:"#c9d1d9", marginBottom:5, lineHeight:1.5 }}>{p}</div>
            <textarea value={answers[i]||""} onChange={e=>setAnswers(a=>({...a,[i]:e.target.value}))}
              placeholder="Write your reflection..." rows={2}
              style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:9, color:"#d1d5db", fontSize:12, padding:"8px 12px", outline:"none", fontFamily:"inherit", resize:"vertical" as const, boxSizing:"border-box" as const }}/>
          </div>
        ))}
        <button onClick={save} style={{ height:34, borderRadius:9, border:`1px solid ${saved?"rgba(0,230,118,0.3)":"rgba(255,171,0,0.2)"}`, background:saved?"rgba(0,230,118,0.2)":"rgba(255,171,0,0.1)", color:saved?"#00e676":"#ffab00", fontSize:12, fontWeight:700, cursor:"pointer" }}>
          {saved ? "✓ Saved" : "Save Reflections"}
        </button>
      </div>
    </div>
  );
}
