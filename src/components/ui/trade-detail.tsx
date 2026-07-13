"use client";

/** Safe number formatter — a missing/NaN field would otherwise crash the page. */
function sf(n: unknown, d = 2): string {
  const v = typeof n === "number" ? n : parseFloat(String(n ?? ""));
  return Number.isFinite(v) ? v.toFixed(d) : "—";
}
import { useState, useRef } from "react";
import { useStore } from "@/store";
import { Trade } from "@/types/trade";
import { fmt$, fmtHold } from "@/lib/utils";
import { format } from "date-fns";

const S = {
  overlay: {position:"fixed" as const,inset:0,zIndex:9998,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16},
  modal: {width:"100%",maxWidth:560,background:"linear-gradient(160deg,#0f1520,#0b1017)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:18,overflow:"hidden",boxShadow:"0 0 80px rgba(0,0,0,0.9)"},
  header: {display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(0,0,0,0.3)"},
  body: {padding:"18px 20px",display:"flex",flexDirection:"column" as const,gap:16,maxHeight:"70vh",overflowY:"auto" as const},
  label: {fontSize:10,fontWeight:700,textTransform:"uppercase" as const,letterSpacing:"0.08em",color:"#3d4551",marginBottom:6},
  input: {width:"100%",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,color:"#d1d5db",fontSize:13,padding:"8px 12px",outline:"none",resize:"vertical" as const,fontFamily:"inherit"},
};

interface Props { trade: Trade; onClose: () => void; }

export function TradeDetailPanel({ trade, onClose }: Props) {
  const { updateTrade, allTags, addTag } = useStore();
  const [notes,    setNotes]    = useState(trade.notes || "");
  const [tags,     setTags]     = useState<string[]>(trade.tags || []);
  const [rating,   setRating]   = useState(trade.rating || 0);
  const [slippage, setSlippage] = useState(trade.expectedEntry?.toString() || "");
  const [tagInput, setTagInput] = useState("");
  const [saved,    setSaved]    = useState(false);

  const isPos = (trade.netPnl || 0) >= 0;

  const save = () => {
    const expectedEntry = slippage ? parseFloat(slippage) : null;
    updateTrade(trade.id, { notes, tags, rating, expectedEntry });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const addTagToTrade = (tag: string) => {
    const t = tag.trim();
    if (!t || tags.includes(t)) return;
    const next = [...tags, t];
    setTags(next);
    addTag(t);
    setTagInput("");
  };

  const removeTag = (tag: string) => setTags(tags.filter(t => t !== tag));

  const slippageVal = trade.expectedEntry ? Math.abs(trade.entryPrice - trade.expectedEntry) : null;

  return (
    <div style={S.overlay} onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div style={S.modal}>
        {/* Header */}
        <div style={S.header}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:16,fontWeight:900,fontFamily:"monospace",color:"#f0f6fc"}}>{trade.ticker}</span>
            <span style={{padding:"2px 8px",borderRadius:5,fontSize:10,fontWeight:700,background:trade.side==="LONG"?"rgba(0,230,118,0.12)":"rgba(255,23,68,0.12)",color:trade.side==="LONG"?"#00e676":"#ff1744"}}>{trade.side}</span>
            <span style={{fontSize:13,fontWeight:800,fontFamily:"monospace",color:isPos?"#00e676":"#ff1744"}}>{fmt$(trade.netPnl||0)}</span>
          </div>
          <button onClick={onClose} style={{width:28,height:28,borderRadius:8,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",color:"#4b5563",cursor:"pointer",fontSize:17,display:"flex",alignItems:"center",justifyContent:"center"}}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.1)";(e.currentTarget as HTMLElement).style.color="#c9d1d9";}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.05)";(e.currentTarget as HTMLElement).style.color="#4b5563";}}>×</button>
        </div>

        <div style={S.body}>
          {/* Trade summary */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
            {[
              ["Entry",  "$"+sf(trade.entryPrice, 4),               "#c9d1d9"],
              ["Exit",   trade.exitPrice?"$"+sf(trade.exitPrice, 4):"Open", "#c9d1d9"],
              ["Hold",   fmtHold(trade.holdTimeSeconds),           "#c9d1d9"],
              ["R",      Number.isFinite(trade.rMultiple as number)?sf(trade.rMultiple,2)+"R":"—", Number.isFinite(trade.rMultiple as number)&&(trade.rMultiple as number)>=0?"#00e676":"#ff1744"],
            ].map(([l,v,c])=>(
              <div key={l as string} style={{background:"rgba(255,255,255,0.03)",borderRadius:8,padding:"8px 10px"}}>
                <div style={{fontSize:9,color:"#3d4551",textTransform:"uppercase" as const,letterSpacing:"0.07em",marginBottom:3}}>{l}</div>
                <div style={{fontSize:12,fontWeight:700,fontFamily:"monospace",color:c as string}}>{v}</div>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div>
            <div style={S.label}>Notes</div>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={4}
              placeholder="What happened? Why did you take this trade? What did you learn?"
              style={{...S.input, minHeight:80}}/>
          </div>

          {/* Tags */}
          <div>
            <div style={S.label}>Setup Tags</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap" as const,marginBottom:8}}>
              {tags.map(tag=>(
                <span key={tag} style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600,background:"rgba(0,229,255,0.1)",border:"1px solid rgba(0,229,255,0.2)",color:"#00e5ff",display:"flex",alignItems:"center",gap:5}}>
                  {tag}
                  <button onClick={()=>removeTag(tag)} style={{background:"none",border:"none",color:"#00e5ff",cursor:"pointer",fontSize:13,lineHeight:1,padding:0}}>×</button>
                </span>
              ))}
            </div>
            {/* Quick add from known tags */}
            <div style={{display:"flex",gap:5,flexWrap:"wrap" as const,marginBottom:8}}>
              {allTags.filter(t=>!tags.includes(t)).slice(0,12).map(tag=>(
                <button key={tag} onClick={()=>addTagToTrade(tag)} style={{padding:"2px 9px",borderRadius:20,fontSize:11,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#6b7280",cursor:"pointer"}}>
                  + {tag}
                </button>
              ))}
            </div>
            <div style={{display:"flex",gap:6}}>
              <input value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTagToTrade(tagInput)}
                placeholder="Custom tag..." style={{...S.input,flex:1,height:32,padding:"0 10px"}}/>
              <button onClick={()=>addTagToTrade(tagInput)} style={{height:32,padding:"0 14px",borderRadius:8,background:"rgba(0,229,255,0.1)",border:"1px solid rgba(0,229,255,0.2)",color:"#00e5ff",fontSize:12,fontWeight:700,cursor:"pointer"}}>Add</button>
            </div>
          </div>

          {/* Rating */}
          <div>
            <div style={S.label}>Trade Quality Rating</div>
            <div style={{display:"flex",gap:8}}>
              {[1,2,3,4,5].map(n=>(
                <button key={n} onClick={()=>setRating(n===rating?0:n)} style={{
                  width:36,height:36,borderRadius:9,border:"1px solid",
                  borderColor:n<=rating?"rgba(255,171,0,0.5)":"rgba(255,255,255,0.08)",
                  background:n<=rating?"rgba(255,171,0,0.12)":"rgba(255,255,255,0.03)",
                  color:n<=rating?"#ffab00":"#374151",
                  fontSize:16,cursor:"pointer",
                }}>★</button>
              ))}
              <span style={{fontSize:11,color:"#4b5563",alignSelf:"center",marginLeft:4}}>
                {["","Poor","Below avg","Average","Good","Excellent"][rating]||""}
              </span>
            </div>
          </div>

          {/* Expected entry / slippage */}
          <div>
            <div style={S.label}>Expected Entry Price <span style={{color:"#4b5563",fontWeight:400,textTransform:"none" as const}}>(for slippage tracking)</span></div>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <input value={slippage} onChange={e=>setSlippage(e.target.value)} type="number" step="0.01"
                placeholder={sf(trade.entryPrice, 4)} style={{...S.input,width:160,height:34,padding:"0 10px"}}/>
              {slippageVal!==null && (
                <span style={{fontSize:12,color:"#ffab00",fontFamily:"monospace"}}>
                  Slippage: {sf(slippageVal, 4)} pts
                </span>
              )}
            </div>
          </div>

          {/* Screenshot link */}
          <div>
            <div style={S.label}>Screenshot URL <span style={{color:"#4b5563",fontWeight:400,textTransform:"none" as const}}>(paste image link or TradingView chart URL)</span></div>
            <input
              defaultValue={(trade.screenshots||[])[0]||""}
              onBlur={e=>updateTrade(trade.id,{screenshots:e.target.value?[e.target.value]:[]})}
              placeholder="https://..." style={{...S.input,height:34,padding:"0 10px"}}/>
            {(trade.screenshots||[])[0] && (
              <a href={trade.screenshots[0]} target="_blank" rel="noreferrer"
                style={{display:"inline-block",marginTop:6,fontSize:11,color:"#00e5ff"}}>
                Open screenshot ↗
              </a>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{display:"flex",justifyContent:"flex-end",gap:8,padding:"12px 20px",borderTop:"1px solid rgba(255,255,255,0.05)",background:"rgba(0,0,0,0.2)"}}>
          <button onClick={onClose} style={{height:32,padding:"0 16px",borderRadius:8,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.04)",color:"#6b7280",cursor:"pointer",fontSize:12}}>Cancel</button>
          <button onClick={save} style={{height:32,padding:"0 20px",borderRadius:8,border:"none",background:saved?"rgba(0,230,118,0.15)":"linear-gradient(135deg,#00e5ff,#0088bb)",color:saved?"#00e676":"#000",cursor:"pointer",fontSize:12,fontWeight:700,transition:"all 0.2s"}}>
            {saved?"✓ Saved":"Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
