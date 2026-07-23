"use client";
import { useState, useEffect } from "react";
import { getScoped, setScoped } from "@/lib/user-storage";
import { useStore } from "@/store";

interface CheckItem { id: string; text: string; checked: boolean; }

const DEFAULT_ITEMS: CheckItem[] = [
  { id:"1", text:"Market is in session (not pre/post)", checked:false },
  { id:"2", text:"Checked higher timeframe trend direction", checked:false },
  { id:"3", text:"Clear entry trigger from my playbook", checked:false },
  { id:"4", text:"Stop loss level identified before entry", checked:false },
  { id:"5", text:"Take profit target set (min 1:1 R:R)", checked:false },
  { id:"6", text:"Position size calculated (max 2% risk)", checked:false },
  { id:"7", text:"Not revenge trading from a prior loss", checked:false },
  { id:"8", text:"No major news event in next 30 minutes", checked:false },
  { id:"9", text:"Not already at daily max loss limit", checked:false },
  { id:"10",text:"I can explain WHY I'm taking this trade", checked:false },
];

function RiskCalc() {
  const [balance, setBalance] = useState("10000");
  const [riskPct, setRiskPct] = useState("1");
  const [stopPts, setStopPts] = useState("");
  const [ticker,  setTicker]  = useState("NQ");
  const [isMobile, setIsMobile] = useState(() => typeof window!=="undefined" ? window.innerWidth < 768 : false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const MULTS: Record<string,number> = { NQ:20, MNQ:2, ES:50, MES:5, YM:5, MYM:0.5, RTY:50, M2K:5, GC:100, MGC:10, CL:1000, SI:5000 };
  const mult = MULTS[ticker.toUpperCase()] || 1;
  const riskDollar = (+balance * +riskPct) / 100;
  const contracts = stopPts && mult ? (riskDollar / (+stopPts * mult)) : 0;

  const IS = { background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:8, color:"#d1d5db", fontSize:13, padding:"7px 10px", outline:"none", width:"100%" } as const;

  return (
    <div style={{ background:"rgba(0,0,0,0.2)", borderRadius:12, padding:16 }}>
      <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.08em", color:"#00e5ff", marginBottom:12 }}>
        ⚡ Position Size Calculator
      </div>
      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:10, marginBottom:12 }}>
        <div>
          <div style={{ fontSize:9, color:"#4b5563", marginBottom:4 }}>Account Balance ($)</div>
          <input value={balance} onChange={e=>setBalance(e.target.value)} type="number" style={IS}/>
        </div>
        <div>
          <div style={{ fontSize:9, color:"#4b5563", marginBottom:4 }}>Risk % per trade</div>
          <input value={riskPct} onChange={e=>setRiskPct(e.target.value)} type="number" step="0.1" style={IS}/>
        </div>
        <div>
          <div style={{ fontSize:9, color:"#4b5563", marginBottom:4 }}>Symbol</div>
          <input value={ticker} onChange={e=>setTicker(e.target.value)} placeholder="NQ, ES, MGC..." style={IS}/>
        </div>
        <div>
          <div style={{ fontSize:9, color:"#4b5563", marginBottom:4 }}>Stop Distance (pts)</div>
          <input value={stopPts} onChange={e=>setStopPts(e.target.value)} type="number" step="0.25" placeholder="e.g. 20" style={IS}/>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr 1fr", gap:10 }}>
        <div style={{ background:"rgba(0,229,255,0.06)", border:"1px solid rgba(0,229,255,0.15)", borderRadius:8, padding:"10px 12px" }}>
          <div style={{ fontSize:9, color:"#4b5563", marginBottom:3 }}>Risk Amount</div>
          <div style={{ fontSize:18, fontWeight:800, fontFamily:"monospace", color:"#00e5ff" }}>${riskDollar.toFixed(0)}</div>
        </div>
        <div style={{ background:"rgba(0,230,118,0.06)", border:"1px solid rgba(0,230,118,0.15)", borderRadius:8, padding:"10px 12px" }}>
          <div style={{ fontSize:9, color:"#4b5563", marginBottom:3 }}>Contracts / Lots</div>
          <div style={{ fontSize:18, fontWeight:800, fontFamily:"monospace", color:"#00e676" }}>
            {contracts > 0 ? contracts.toFixed(2) : "—"}
          </div>
        </div>
        <div style={{ background:"rgba(213,0,249,0.06)", border:"1px solid rgba(213,0,249,0.15)", borderRadius:8, padding:"10px 12px" }}>
          <div style={{ fontSize:9, color:"#4b5563", marginBottom:3 }}>Multiplier</div>
          <div style={{ fontSize:18, fontWeight:800, fontFamily:"monospace", color:"#d500f9" }}>${mult}/pt</div>
        </div>
      </div>
      {contracts > 0 && stopPts && (
        <div style={{ marginTop:10, fontSize:12, color:"#4b5563", lineHeight:1.7 }}>
          Trade <strong style={{color:"#f0f6fc"}}>{Math.floor(contracts)} contract{Math.floor(contracts)!==1?"s":""}</strong> of <strong style={{color:"#f0f6fc"}}>{ticker.toUpperCase()}</strong> with a <strong style={{color:"#f0f6fc"}}>{stopPts}pt</strong> stop
          = <strong style={{color:"#ff1744"}}>${(Math.floor(contracts)*+stopPts*mult).toFixed(0)}</strong> max loss (<strong style={{color:"#00e5ff"}}>{riskPct}%</strong> of account)
        </div>
      )}
    </div>
  );
}

export default function ChecklistPage() {
  const { playbook } = useStore();
  const [items, setItems] = useState<CheckItem[]>(DEFAULT_ITEMS);
  const [loaded, setLoaded] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window!=="undefined" ? window.innerWidth < 768 : false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Load this user's saved checklist (custom items survive refresh)
  useEffect(() => {
    const saved = getScoped<CheckItem[] | null>("th_checklist_items", null);
    if (Array.isArray(saved) && saved.length) setItems(saved);
    setLoaded(true);
  }, []);

  // Save on every change (skip the first render so we don't clobber saved data)
  useEffect(() => {
    if (!loaded) return;
    setScoped("th_checklist_items", items);
  }, [items, loaded]);
  const [custom, setCustom] = useState("");
  const [selectedSetup, setSelectedSetup] = useState<string>("");
  const [showCalc, setShowCalc] = useState(true);
  const [hovId, setHovId] = useState<string|null>(null);

  const toggle = (id: string) =>
    setItems(its => its.map(i => i.id===id ? {...i, checked:!i.checked} : i));

  const addCustom = () => {
    if (!custom.trim()) return;
    setItems(its => [...its, { id: Date.now().toString(), text: custom.trim(), checked: false }]);
    setCustom("");
  };

  const removeItem = (id: string) =>
    setItems(its => its.filter(i => i.id !== id));

  const restoreDefaults = () => setItems(DEFAULT_ITEMS.map(i => ({...i, checked:false})));

  const reset = () => setItems(its => its.map(i => ({...i, checked:false})));

  const checked = items.filter(i => i.checked).length;
  const total = items.length;
  const allChecked = checked === total;
  const pct = total > 0 ? (checked/total*100) : 0;

  // Add rules from selected playbook setup
  const addFromPlaybook = (id: string) => {
    const entry = playbook.find(e => e.id === id);
    if (!entry) return;
    const newItems = entry.rules.filter(Boolean).map(r => ({
      id: `pb-${Date.now()}-${Math.random()}`,
      text: r,
      checked: false,
    }));
    setItems(its => [...its, ...newItems]);
    setSelectedSetup("");
  };

  return (
    <div style={{ padding:20, overflowY:"auto", height:"100%", display:"flex", flexDirection:"column", gap:14 }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <h2 style={{ fontSize:16, fontWeight:800, color:"#f0f6fc" }}>Pre-Trade Checklist</h2>
          <p style={{ fontSize:11, color:"#4b5563", marginTop:2 }}>Run through this before every trade. Discipline = consistency.</p>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {playbook.length > 0 && (
            <select value={selectedSetup} onChange={e=>addFromPlaybook(e.target.value)}
              style={{ height:34, padding:"0 10px", borderRadius:9, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", color:"#6b7280", fontSize:12, cursor:"pointer" }}>
              <option value="">+ Add from Playbook</option>
              {playbook.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          )}
          <button onClick={reset} style={{ height:34, padding:"0 16px", borderRadius:9, border:"1px solid rgba(255,255,255,0.09)", background:"rgba(255,255,255,0.04)", color:"#6b7280", cursor:"pointer", fontSize:12 }}>Reset</button>
        </div>
      </div>

      {/* Progress */}
      <div style={{ background:"linear-gradient(160deg,#0f1520,#0b1017)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:"16px 20px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
          <span style={{ fontSize:13, fontWeight:700, color: allChecked ? "#00e676" : "#f0f6fc" }}>
            {allChecked ? "✅ Ready to trade!" : `${checked} / ${total} complete`}
          </span>
          <span style={{ fontSize:13, fontWeight:800, fontFamily:"monospace", color: allChecked ? "#00e676" : "#ffab00" }}>{pct.toFixed(0)}%</span>
        </div>
        <div style={{ height:8, borderRadius:4, background:"rgba(255,255,255,0.05)", overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${pct}%`, borderRadius:4, background: allChecked ? "#00e676" : "linear-gradient(90deg,#ffab00,#00e5ff)", transition:"width 0.4s ease", boxShadow: allChecked ? "0 0 12px rgba(0,230,118,0.4)" : "none" }}/>
        </div>
        {!allChecked && checked > 0 && (
          <div style={{ fontSize:11, color:"#4b5563", marginTop:6 }}>{total-checked} item{total-checked!==1?"s":""} remaining</div>
        )}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:14 }}>
        {/* Checklist */}
        <div style={{ background:"linear-gradient(160deg,#0f1520,#0b1017)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:18, display:"flex", flexDirection:"column", gap:4 }}>
          <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.08em", color:"#3d4551", marginBottom:8 }}>Checklist Items</div>
          {items.length === 0 && (
            <div style={{ padding:"18px 12px", textAlign:"center", fontSize:12, color:"#4b5563", lineHeight:1.6 }}>
              No checklist items.<br/>
              <span onClick={restoreDefaults} style={{ color:"#00e5ff", cursor:"pointer", textDecoration:"underline" }}>Restore defaults</span>
            </div>
          )}
          {items.map(item => (
            <div key={item.id} onClick={()=>toggle(item.id)}
              onMouseEnter={()=>setHovId(item.id)} onMouseLeave={()=>setHovId(null)}
              style={{
              display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:9, cursor:"pointer",
              background: item.checked ? "rgba(0,230,118,0.06)" : "rgba(255,255,255,0.02)",
              border:`1px solid ${item.checked ? "rgba(0,230,118,0.2)" : "rgba(255,255,255,0.04)"}`,
              transition:"all 0.15s",
            }}>
              <div style={{
                width:20, height:20, borderRadius:6, border:`2px solid ${item.checked?"#00e676":"rgba(255,255,255,0.15)"}`,
                background: item.checked ? "#00e676" : "transparent",
                display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all 0.15s",
              }}>
                {item.checked && <span style={{color:"#000",fontSize:12,fontWeight:900,lineHeight:1}}>✓</span>}
              </div>
              <span style={{ flex:1, fontSize:12, color: item.checked ? "#6b7280" : "#c9d1d9", textDecoration: item.checked?"line-through":"none", lineHeight:1.4 }}>{item.text}</span>
              <button
                onClick={(e)=>{ e.stopPropagation(); removeItem(item.id); }}
                title="Delete item"
                aria-label={`Delete ${item.text}`}
                style={{
                  width:22, height:22, borderRadius:6, flexShrink:0, cursor:"pointer",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  background:"transparent",
                  border:`1px solid ${hovId===item.id ? "rgba(255,23,68,0.3)" : "transparent"}`,
                  color: hovId===item.id ? "#ff1744" : "transparent",
                  fontSize:13, lineHeight:1, transition:"all 0.15s", padding:0,
                }}>×</button>
            </div>
          ))}
          <div style={{ display:"flex", gap:6, marginTop:8 }}>
            <input value={custom} onChange={e=>setCustom(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCustom()}
              placeholder="Add custom item..." style={{ flex:1, height:32, padding:"0 10px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, color:"#d1d5db", fontSize:12, outline:"none" }}/>
            <button onClick={addCustom} style={{ height:32, padding:"0 12px", borderRadius:8, background:"rgba(0,229,255,0.1)", border:"1px solid rgba(0,229,255,0.2)", color:"#00e5ff", cursor:"pointer", fontSize:12, fontWeight:700 }}>+</button>
          </div>
        </div>

        {/* Risk Calculator */}
        <div style={{ background:"linear-gradient(160deg,#0f1520,#0b1017)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:18 }}>
          <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.08em", color:"#3d4551", marginBottom:12 }}>Position Size Calculator</div>
          <RiskCalc/>
        </div>
      </div>
    </div>
  );
}
