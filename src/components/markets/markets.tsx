"use client";
import { getScoped, setScoped } from "@/lib/user-storage";
import { useState, useEffect, useRef } from "react";

// Symbol list for the quote strip
const WATCHLIST = [
  { sym:"CME_MINI:NQ1!", label:"NQ",  name:"Nasdaq E-mini" },
  { sym:"CME_MINI:ES1!", label:"ES",  name:"S&P 500 E-mini" },
  { sym:"CBOT_MINI:YM1!",label:"YM",  name:"Dow E-mini" },
  { sym:"CME_MINI:RTY1!",label:"RTY", name:"Russell 2000" },
  { sym:"NYMEX:CL1!",    label:"CL",  name:"Crude Oil" },
  { sym:"COMEX:GC1!",    label:"GC",  name:"Gold" },
  { sym:"COMEX:MGC1!",   label:"MGC", name:"Micro Gold" },
  { sym:"NYMEX:NG1!",    label:"NG",  name:"Nat Gas" },
  { sym:"CBOT:ZN1!",     label:"ZN",  name:"10-Yr Note" },
  { sym:"FX:EURUSD",     label:"EUR/USD", name:"Euro" },
  { sym:"FX:GBPUSD",     label:"GBP/USD", name:"Pound" },
  { sym:"BINANCE:BTCUSDT",label:"BTC", name:"Bitcoin" },
  { sym:"BINANCE:ETHUSDT",label:"ETH", name:"Ethereum" },
  { sym:"NASDAQ:AAPL",   label:"AAPL",name:"Apple" },
  { sym:"NASDAQ:NVDA",   label:"NVDA",name:"Nvidia" },
  { sym:"NASDAQ:TSLA",   label:"TSLA",name:"Tesla" },
  { sym:"AMEX:SPY",      label:"SPY", name:"S&P ETF" },
  { sym:"AMEX:QQQ",      label:"QQQ", name:"Nasdaq ETF" },
];

const TIMEFRAMES = [
  { label:"1m",  tv:"1"   },
  { label:"5m",  tv:"5"   },
  { label:"15m", tv:"15"  },
  { label:"1h",  tv:"60"  },
  { label:"4h",  tv:"240" },
  { label:"D",   tv:"D"   },
  { label:"W",   tv:"W"   },
];

export default function MarketsPage() {
  const [selected, setSelected] = useState(WATCHLIST.find(w=>w.label==="SPY") || WATCHLIST[0]);
  const [tfIdx, setTfIdx] = useState(1); // default 5m
  const [loaded, setLoaded] = useState(false);
  const [custom, setCustom] = useState("");
  const [customList, setCustomList] = useState<{sym:string;label:string;name:string}[]>(() => {
    return getScoped("th_markets_custom", []);
  });
  const [hidden, setHidden] = useState<string[]>(() => {
    const saved = getScoped<string[]|null>("th_markets_hidden", null);
    // First visit: hide everything except SPY and QQQ
    if (saved === null) {
      return WATCHLIST.filter(w => w.label !== "SPY" && w.label !== "QQQ").map(w => w.sym);
    }
    return saved;
  });

  // Persist on change
  useEffect(() => { setScoped("th_markets_custom", customList); }, [customList]);
  useEffect(() => { setScoped("th_markets_hidden", hidden); }, [hidden]);
  const [editMode, setEditMode] = useState(false);

  const tf = TIMEFRAMES[tfIdx];
  const containerRef = useRef<HTMLDivElement>(null);

  // Load TradingView widget via their official script - reliably loads any symbol
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setLoaded(false);
    container.innerHTML = "";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "100%";
    widgetDiv.style.width = "100%";
    container.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: selected.sym,
      interval: tf.tv,
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "#060a0f",
      gridColor: "rgba(255,255,255,0.04)",
      hide_top_toolbar: false,
      withdateranges: true,
      hide_volume: false,
      allow_symbol_change: false,
      support_host: "https://www.tradingview.com",
    });
    script.onload = () => setLoaded(true);
    container.appendChild(script);
    // Fallback: mark loaded after a delay in case onload doesn't fire
    const t = setTimeout(() => setLoaded(true), 1500);
    return () => clearTimeout(t);
  }, [selected.sym, tf.tv]);

  const allWatchlist = [...WATCHLIST, ...customList].filter(w => !hidden.includes(w.sym));

  const removeTab = (sym: string) => {
    const isCustom = customList.some(c => c.sym === sym);
    if (isCustom) setCustomList(prev => prev.filter(c => c.sym !== sym));
    else setHidden(prev => [...prev, sym]);
    if (selected.sym === sym) {
      const remaining = allWatchlist.filter(w => w.sym !== sym);
      if (remaining.length) selectSym(remaining[0]);
    }
  };

  const addCustom = () => {
    const s = custom.trim().toUpperCase();
    if (!s) return;
    const entry = { sym: s, label: s, name: s };
    setCustomList(prev => [...prev, entry]);
    setSelected(entry);
    setLoaded(false);
    setCustom("");
  };

  const selectSym = (item: typeof WATCHLIST[0]) => {
    setSelected(item);
    setLoaded(false);
  };

  return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", overflow:"hidden" }}>

      {/* -- Symbol strip -- */}
      <div style={{ display:"flex", alignItems:"center", gap:0, padding:"0 0", borderBottom:"1px solid rgba(255,255,255,0.05)", background:"rgba(0,0,0,0.3)", flexShrink:0, overflowX:"auto" }}>
        {allWatchlist.map((item) => {
          const active = item.sym === selected.sym;
          return (
            <div key={item.sym} style={{ position:"relative" as const, flexShrink:0, display:"flex" }}>
              <button onClick={() => !editMode && selectSym(item)} style={{
                height:42, padding:`0 ${editMode ? "28px" : "16px"} 0 16px`, border:"none", borderRight:"1px solid rgba(255,255,255,0.04)",
                background: active ? "rgba(0,229,255,0.1)" : "transparent",
                borderBottom: active ? "2px solid #00e5ff" : "2px solid transparent",
                cursor: editMode ? "default" : "pointer", whiteSpace:"nowrap" as const, transition:"all 0.12s",
                display:"flex", flexDirection:"column" as const, alignItems:"center", justifyContent:"center", gap:1,
                opacity: editMode ? 0.7 : 1,
              }}>
                <span style={{ fontSize:12, fontWeight:800, color: active ? "#00e5ff" : "#8b949e", fontFamily:"monospace", letterSpacing:"-0.02em" }}>{item.label}</span>
                <span style={{ fontSize:9, color:"#3d4551" }}>{item.name}</span>
              </button>
              {editMode && (
                <button onClick={e => { e.stopPropagation(); removeTab(item.sym); }}
                  style={{ position:"absolute", top:4, right:4, width:16, height:16, borderRadius:"50%", background:"rgba(255,23,68,0.8)", border:"none", color:"#fff", fontSize:10, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1, fontWeight:900 }}>✕</button>
              )}
            </div>
          );
        })}
        {/* Edit + Add */}
        <div style={{ display:"flex", alignItems:"center", gap:6, padding:"0 12px", flexShrink:0, borderLeft:"1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={() => setEditMode(e => !e)} style={{ height:26, padding:"0 10px", borderRadius:6, background: editMode ? "rgba(255,171,0,0.15)" : "rgba(255,255,255,0.04)", border:`1px solid ${editMode ? "rgba(255,171,0,0.3)" : "rgba(255,255,255,0.08)"}`, color: editMode ? "#ffab00" : "#4b5563", fontSize:11, fontWeight:700, cursor:"pointer" }}>
            {editMode ? "Done" : "✎ Edit"}
          </button>
          {!editMode && <>
            <input value={custom} onChange={e=>setCustom(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&addCustom()}
              placeholder="Add symbol..." style={{ height:26, width:110, padding:"0 8px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:6, color:"#d1d5db", fontSize:11, outline:"none" }}/>
            <button onClick={addCustom} style={{ height:26, padding:"0 10px", borderRadius:6, background:"rgba(0,229,255,0.1)", border:"1px solid rgba(0,229,255,0.2)", color:"#00e5ff", fontSize:12, fontWeight:700, cursor:"pointer" }}>+</button>
          </>}
        </div>
      </div>

      {/* -- Timeframe bar -- */}
      <div style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", borderBottom:"1px solid rgba(255,255,255,0.05)", background:"rgba(0,0,0,0.15)", flexShrink:0 }}>
        <span style={{ fontSize:10, color:"#3d4551", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginRight:4 }}>Interval</span>
        {TIMEFRAMES.map((t,i) => (
          <button key={t.label} onClick={() => { setTfIdx(i); setLoaded(false); }} style={{
            height:26, padding:"0 12px", borderRadius:7, border:"1px solid",
            borderColor: tfIdx===i ? "rgba(0,229,255,0.4)" : "rgba(255,255,255,0.07)",
            background:  tfIdx===i ? "rgba(0,229,255,0.1)" : "rgba(255,255,255,0.03)",
            color:       tfIdx===i ? "#00e5ff" : "#4b5563",
            fontSize:11, fontWeight:700, cursor:"pointer", transition:"all 0.12s",
          }}>{t.label}</button>
        ))}
        <div style={{ marginLeft:"auto", fontSize:10, color:"#3d4551" }}>
          Powered by TradingView · Free, no login required
        </div>
      </div>

      {/* -- Chart -- */}
      <div style={{ flex:1, position:"relative", background:"#060a0f", minHeight:0 }}>
        {!loaded && (
          <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column" as const, alignItems:"center", justifyContent:"center", gap:12, zIndex:2, pointerEvents:"none" }}>
            <div style={{ width:36, height:36, borderRadius:"50%", border:"2px solid rgba(0,229,255,0.15)", borderTop:"2px solid #00e5ff", animation:"spin 0.8s linear infinite" }}/>
            <span style={{ fontSize:12, color:"#3d4551" }}>Loading {selected.label} chart...</span>
          </div>
        )}
        <div
          ref={containerRef}
          className="tradingview-widget-container"
          style={{ width:"100%", height:"100%", opacity:loaded?1:0, transition:"opacity 0.25s" }}
        />
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
