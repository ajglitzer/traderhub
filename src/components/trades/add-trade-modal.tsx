"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/store";
import { useAccountStore } from "@/store/accounts";
import { Trade } from "@/types/trade";
import { calculateTradePnl } from "@/lib/calculations";

interface Props { onClose: () => void; }

const IS: React.CSSProperties = {
  width:"100%", height:38, background:"rgba(255,255,255,0.05)",
  border:"1px solid rgba(255,255,255,0.09)", borderRadius:8,
  color:"#f0f6fc", fontSize:13, padding:"0 12px", outline:"none",
  fontFamily:"inherit",
};
const LB: React.CSSProperties = {
  fontSize:10, fontWeight:700, textTransform:"uppercase",
  letterSpacing:"0.08em", color:"#4b5563", marginBottom:5, display:"block",
};
const SEL: React.CSSProperties = {
  ...{} as any,
  width:"100%", height:38, background:"rgba(255,255,255,0.05)",
  border:"1px solid rgba(255,255,255,0.09)", borderRadius:8,
  color:"#f0f6fc", fontSize:13, padding:"0 12px", outline:"none",
  fontFamily:"inherit", cursor:"pointer",
};

export function AddTradeModal({ onClose }: Props) {
  const { addAccountTrades, activeAccountId } = useAccountStore();
  const now = new Date();
  const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const [isMobile, setIsMobile] = useState(() => typeof window!=="undefined" ? window.innerWidth < 768 : false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  const [ticker,      setTicker]      = useState("NQ1!");
  const [side,        setSide]        = useState<"LONG"|"SHORT">("LONG");
  const [assetClass,  setAssetClass]  = useState("FUTURES");
  const [entryPrice,  setEntryPrice]  = useState("");
  const [exitPrice,   setExitPrice]   = useState("");
  const [quantity,    setQuantity]    = useState("1");
  const [entryTime,   setEntryTime]   = useState(localNow);
  const [exitTime,    setExitTime]    = useState(localNow);
  const [stopLoss,    setStopLoss]    = useState("");
  const [takeProfit,  setTakeProfit]  = useState("");
  const [strategy,    setStrategy]    = useState("");
  const [notes,       setNotes]       = useState("");
  const [manualPnl,   setManualPnl]   = useState("");
  const [useManual,   setUseManual]   = useState(false);
  const [error,       setError]       = useState("");
  const [saving,      setSaving]      = useState(false);

  // Live PnL preview
  const ep = parseFloat(entryPrice);
  const xp = parseFloat(exitPrice);
  const qty = parseFloat(quantity) || 1;
  const symUpper = ticker.toUpperCase();
  const ptVal = symUpper.includes("MNQ")?2:symUpper.includes("MES")?5:symUpper.includes("NQ")?20:symUpper.includes("ES")?50:symUpper.includes("MGC")?10:symUpper.includes("GC")?100:symUpper.includes("YM")?5:1;
  const calcPnl = ep && xp ? (side === "LONG" ? (xp - ep) : (ep - xp)) * qty * ptVal : null;
  const displayPnl = useManual ? parseFloat(manualPnl) : calcPnl;
  const isOpen = !exitPrice || !xp;
  const hold = entryTime && exitTime && !isOpen
    ? Math.round((new Date(exitTime).getTime() - new Date(entryTime).getTime()) / 1000)
    : null;

  const save = () => {
    if (!ticker.trim()) { setError("Ticker is required"); return; }
    if (!entryPrice || isNaN(ep)) { setError("Entry price is required"); return; }
    setSaving(true);
    setError("");

    const trade: Trade = {
      id: `manual_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ticker: ticker.toUpperCase().trim(),
      assetClass: assetClass as Trade["assetClass"],
      side,
      status: isOpen ? "OPEN" : "CLOSED",
      entryPrice: ep,
      exitPrice: isOpen ? null : xp,
      quantity: qty,
      entryTime: new Date(entryTime).toISOString(),
      exitTime: isOpen ? null : new Date(exitTime).toISOString(),
      holdTimeSeconds: hold,
      fees: 0, commissions: 0,
      grossPnl: isOpen ? null : (useManual ? parseFloat(manualPnl)||0 : calcPnl),
      netPnl:   isOpen ? null : (useManual ? parseFloat(manualPnl)||0 : calcPnl),
      manualPnl: useManual ? parseFloat(manualPnl)||0 : null,
      stopLoss:   stopLoss   ? parseFloat(stopLoss)   : null,
      takeProfit: takeProfit ? parseFloat(takeProfit) : null,
      riskAmount: null, rMultiple: null, riskReward: null,
      strategy: strategy||null, setup: null, timeframe: null,
      notes: notes||null, tags: ["manual"], emotions: [],
      rating: null, favorite: false, reviewLater: false,
      screenshots: [], customFields: {},
    };

    addAccountTrades(activeAccountId, [trade]);
    setSaving(false);
    onClose();
  };

  const modal = (
    <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:"fixed",inset:0,zIndex:99999,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(12px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,overflowY:"auto"}}>
      <div style={{width:"100%",maxWidth:520,background:"linear-gradient(160deg,#0f1520,#0b1017)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:18,overflow:"hidden"}}>
        {/* Header */}
        <div style={{padding:"16px 22px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:15,fontWeight:800,color:"#f0f6fc"}}>Add Trade Manually</div>
            <div style={{fontSize:11,color:"#4b5563",marginTop:2}}>Log a trade that wasn't imported from a CSV</div>
          </div>
          <button onClick={onClose} style={{width:28,height:28,borderRadius:"50%",border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.04)",color:"#6b7280",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>

        {/* Body */}
        <div style={{padding:22,display:"flex",flexDirection:"column",gap:14}}>
          {/* Row 1: Ticker + Side + Asset Class */}
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"2fr 1fr 2fr",gap:10}}>
            <div><span style={LB}>Symbol</span><input value={ticker} onChange={e=>setTicker(e.target.value.toUpperCase())} placeholder="NQ1!" style={IS}/></div>
            <div>
              <span style={LB}>Side</span>
              <select value={side} onChange={e=>setSide(e.target.value as "LONG"|"SHORT")} style={{...SEL,color:side==="LONG"?"#00e676":"#ff1744"}}>
                <option value="LONG">▲ LONG</option>
                <option value="SHORT">▼ SHORT</option>
              </select>
            </div>
            <div>
              <span style={LB}>Asset Class</span>
              <select value={assetClass} onChange={e=>setAssetClass(e.target.value)} style={SEL}>
                {["FUTURES","STOCK","CRYPTO","FOREX","OPTIONS","ETF","CFD"].map(a=><option key={a}>{a}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: Entry + Exit prices */}
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr 1fr",gap:10}}>
            <div><span style={LB}>Entry Price</span><input type="number" value={entryPrice} onChange={e=>setEntryPrice(e.target.value)} placeholder="29867.00" style={IS}/></div>
            <div><span style={LB}>Exit Price <span style={{color:"#374151",textTransform:"none" as const}}>(blank = open)</span></span><input type="number" value={exitPrice} onChange={e=>setExitPrice(e.target.value)} placeholder="optional" style={IS}/></div>
            <div><span style={LB}>Quantity</span><input type="number" value={quantity} onChange={e=>setQuantity(e.target.value)} placeholder="1" min="0.01" step="0.01" style={IS}/></div>
          </div>

          {/* Row 3: Times */}
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:10}}>
            <div><span style={LB}>Entry Time</span><input type="datetime-local" value={entryTime} onChange={e=>setEntryTime(e.target.value)} style={IS}/></div>
            <div><span style={LB}>Exit Time</span><input type="datetime-local" value={exitTime} onChange={e=>setExitTime(e.target.value)} style={{...IS,opacity:isOpen?0.4:1}}/></div>
          </div>

          {/* Row 4: SL + TP + Strategy */}
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr 2fr",gap:10}}>
            <div><span style={LB}>Stop Loss</span><input type="number" value={stopLoss} onChange={e=>setStopLoss(e.target.value)} placeholder="optional" style={IS}/></div>
            <div><span style={LB}>Take Profit</span><input type="number" value={takeProfit} onChange={e=>setTakeProfit(e.target.value)} placeholder="optional" style={IS}/></div>
            <div><span style={LB}>Strategy</span><input value={strategy} onChange={e=>setStrategy(e.target.value)} placeholder="e.g. SMC Breakout" style={IS}/></div>
          </div>

          {/* PnL preview + manual override */}
          {!isOpen && (
            <div style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"12px 14px",border:"1px solid rgba(255,255,255,0.06)"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <span style={{fontSize:12,color:"#8b949e"}}>Calculated P&L <span style={{fontSize:10,color:"#4b5563"}}>(×{ptVal}/pt × {qty} contract{qty>1?"s":""})</span></span>
                <span style={{fontSize:16,fontWeight:900,fontFamily:"monospace",color:displayPnl!=null?(displayPnl>=0?"#00e676":"#ff1744"):"#4b5563"}}>
                  {displayPnl!=null ? `${displayPnl>=0?"+":"-"}$${Math.abs(displayPnl).toFixed(2)}` : "—"}
                </span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <input type="checkbox" checked={useManual} onChange={e=>setUseManual(e.target.checked)} id="manual_pnl"/>
                <label htmlFor="manual_pnl" style={{fontSize:11,color:"#6b7280",cursor:"pointer"}}>Override with manual P&L</label>
                {useManual && <input type="number" value={manualPnl} onChange={e=>setManualPnl(e.target.value)} placeholder="e.g. 1290" style={{...IS,flex:1,height:30}} />}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <span style={LB}>Notes</span>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="What happened on this trade?" style={{...IS,height:"auto",padding:"8px 12px",resize:"vertical" as const,width:"100%",boxSizing:"border-box" as const}}/>
          </div>

          {error && <div style={{padding:"8px 12px",borderRadius:8,background:"rgba(255,23,68,0.08)",border:"1px solid rgba(255,23,68,0.2)",fontSize:12,color:"#f87171"}}>{error}</div>}

          {/* Buttons */}
          <div style={{display:"flex",gap:10,marginTop:4}}>
            <button onClick={onClose} style={{flex:1,height:40,borderRadius:9,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.04)",color:"#6b7280",fontSize:13,cursor:"pointer"}}>Cancel</button>
            <button onClick={save} disabled={saving} style={{flex:2,height:40,borderRadius:9,border:"none",background:"linear-gradient(135deg,#00e5ff,#0088bb)",color:"#000",fontSize:13,fontWeight:800,cursor:"pointer",opacity:saving?0.7:1}}>
              {saving ? "Saving..." : `Add ${isOpen?"Open":"Closed"} Trade`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
