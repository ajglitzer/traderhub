"use client";
import { upsertLeaderboardEntry, getGlobalLeaderboard } from "@/lib/social";
import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "@/store";
import { scopedKey } from "@/lib/user-storage";

// -- Types ---------------------------------------------------------------------
interface Candle { o:number; h:number; l:number; c:number; }
interface SimTrade { side:"LONG"|"SHORT"; entry:number; exit:number; pnl:number; result:"TP"|"SL"|"MANUAL"; }
interface SimAccount {
  id: string;
  name: string;
  balance: number;
  startBalance: number;
  trades: SimTrade[];
  createdAt: string;
}

const LS_KEY_BASE = "th_sim_accounts";
const LB_KEY  = "th_sim_leaderboard";

function loadAccounts(): SimAccount[] {
  try { return JSON.parse(localStorage.getItem(scopedKey(LS_KEY_BASE)) || "[]"); } catch { return []; }
}
function saveAccounts(accs: SimAccount[], userId?: string, username?: string) {
  localStorage.setItem(scopedKey(LS_KEY_BASE), JSON.stringify(accs));
  const lb = accs.map(a => ({ name:a.name, balance:a.balance, startBalance:a.startBalance, trades:a.trades.length, wins:a.trades.filter(t=>t.pnl>0).length }));
  lb.sort((a,b) => b.balance - a.balance);
  localStorage.setItem(LB_KEY, JSON.stringify(lb));
  // Push to global Supabase leaderboard if user is logged in
  if (userId && username) {
    accs.forEach(a => {
      upsertLeaderboardEntry(userId, username, a.name, a.balance, a.startBalance, a.trades.length, a.trades.filter(t=>t.pnl>0).length).catch(()=>{});
    });
  }
}
function newAccount(name: string): SimAccount {
  return { id: Date.now().toString(), name, balance:10000, startBalance:10000, trades:[], createdAt: new Date().toISOString() };
}

// -- Chart canvas --------------------------------------------------------------
function drawChart(canvas:HTMLCanvasElement, candles:Candle[], cur:number, inTrade:boolean, entry:number, side:"LONG"|"SHORT", tp:number, sl:number, colors:{up:string,down:string,bg:string}={up:"#00e676",down:"#ff1744",bg:"#060a0f"}, ghostEntry:number=0, ghostTp:number=0, ghostSl:number=0) {
  const dpr=window.devicePixelRatio||1, W=canvas.offsetWidth, H=canvas.offsetHeight;
  if(!W||!H) return;
  canvas.width=W*dpr; canvas.height=H*dpr;
  const ctx=canvas.getContext("2d")!; ctx.scale(dpr,dpr);
  ctx.fillStyle=colors.bg; ctx.fillRect(0,0,W,H);
  const slice=candles.slice(Math.max(0,cur-80),cur);
  if(!slice.length) return;
  const prices=[...slice.map(c=>c.h),...slice.map(c=>c.l)];
  if(inTrade){prices.push(entry,tp,sl);}
  if(ghostEntry){prices.push(ghostEntry,ghostTp,ghostSl);}
  const lo=Math.min(...prices),hi=Math.max(...prices);
  const pad=(hi-lo)*0.12||1;
  const yMin=lo-pad,yMax=hi+pad,yR=yMax-yMin||1;
  const bW=Math.max(2,Math.min(14,(W-32)/slice.length*0.75));
  const toX=(i:number)=>16+(i/(slice.length-1||1))*(W-32);
  const toY=(p:number)=>10+(H-20)-(p-yMin)/yR*(H-20);

  // Background grid
  const isLight = colors.bg === "#ffffff" || colors.bg === "#f0f2f5" || colors.bg === "#f8f9fa";
  const gridColor = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.04)";
  for(let i=0;i<=4;i++){
    ctx.strokeStyle=gridColor; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,10+i/4*(H-20)); ctx.lineTo(W,10+i/4*(H-20)); ctx.stroke();
    // Price labels
    const price = yMax - (i/4)*yR;
    ctx.fillStyle = isLight ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.2)";
    ctx.font="10px monospace"; ctx.textAlign="left";
    ctx.fillText(price.toFixed(0), 4, 10+i/4*(H-20)-3);
  }

  // Candles
  slice.forEach((c,i)=>{
    const bull=c.c>=c.o;
    const upC = colors.up; const downC = colors.down;
    // Wick
    ctx.strokeStyle=bull?upC:downC; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(toX(i),toY(c.h)); ctx.lineTo(toX(i),toY(c.l)); ctx.stroke();
    // Body
    const bodyTop=toY(Math.max(c.o,c.c));
    const bodyBot=toY(Math.min(c.o,c.c));
    const bodyH=Math.max(1.5,bodyBot-bodyTop);
    ctx.fillStyle=bull?upC:downC; ctx.globalAlpha=0.9;
    ctx.fillRect(toX(i)-bW/2,bodyTop,bW,bodyH);
    ctx.globalAlpha=1;
  });

  // Helper to draw level lines
  const drawLevel=(price:number,col:string,lbl:string,dash:number[]=[],alpha:number=1)=>{
    const y=toY(price);
    if(y<0||y>H) return;
    ctx.globalAlpha=alpha;
    ctx.strokeStyle=col; ctx.lineWidth=lbl==="Entry"?2:1.5;
    ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
    ctx.setLineDash([]);
    const txt=`${lbl} ${price.toFixed(1)}`;
    const tw=ctx.measureText(txt).width+10;
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.roundRect(W-tw-4,y-9,tw,16,3); ctx.fill();
    ctx.fillStyle="#000"; ctx.font="bold 10px monospace"; ctx.textAlign="center";
    ctx.fillText(txt,W-tw/2-4,y+2);
    ctx.globalAlpha=1;
  };

  // TradingView-style TP/SL lines with filled zones
  if(inTrade&&entry){
    const entryY=toY(entry);
    // Correct TP/SL direction per side
    const tpAbove=side==="LONG";
    const tpY=toY(tp);
    const slY=toY(sl);

    // Fill zones
    if(tpY>0&&tpY<H){ ctx.fillStyle="rgba(0,230,118,0.06)"; ctx.fillRect(0,Math.min(entryY,tpY),W,Math.abs(entryY-tpY)); }
    if(slY>0&&slY<H){ ctx.fillStyle="rgba(255,23,68,0.06)";  ctx.fillRect(0,Math.min(entryY,slY),W,Math.abs(entryY-slY)); }

    drawLevel(entry,"#00e5ff","Entry");
    drawLevel(tp, tpAbove?"#00e676":"#ff1744","TP",[6,4]);
    drawLevel(sl, tpAbove?"#ff1744":"#00e676","SL",[6,4]);
  }

  // Ghost lines after trade closed
  if(!inTrade&&ghostEntry){
    drawLevel(ghostEntry,"#00e5ff","Entry",[],0.35);
    drawLevel(ghostTp,"#00e676","TP",[6,4],0.35);
    drawLevel(ghostSl,"#ff1744","SL",[6,4],0.35);
  }

  // Current price line
  if(slice.length){
    const lp=slice[slice.length-1].c, y=toY(lp), bull=lp>=slice[slice.length-1].o;
    ctx.strokeStyle=bull?`${colors.up}88`:`${colors.down}88`; ctx.lineWidth=1; ctx.setLineDash([3,4]);
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); ctx.setLineDash([]);
    // Price tag
    const tag=lp.toFixed(1);
    const tw=ctx.measureText(tag).width+8;
    ctx.fillStyle=bull?colors.up:colors.down;
    ctx.fillRect(W-tw-2,y-8,tw,14);
    ctx.fillStyle="#000"; ctx.font="bold 10px monospace"; ctx.textAlign="center";
    ctx.fillText(tag,W-tw/2-2,y+3);
  }
}

// -- Generate realistic candles with volatility clustering ----------------------
function genCandles(symbol:string, count=500): Candle[] {
  const bases:Record<string,number>={NQ:20000,ES:5000,MGC:2500,GC:2500,CL:80,BTC:65000,ETH:3500};
  const base = bases[symbol]||100;
  let p = base;
  const v = base * 0.0015; // base volatility per candle
  const out:Candle[]=[];
  let trend = 0;
  let volatility = 1.0; // volatility multiplier (clusters)
  let trendStrength = 0;

  for(let i=0;i<count;i++){
    // Volatility clustering - vol stays high or low for runs
    if(Math.random()<0.08) volatility = 0.5 + Math.random()*2.5;
    else volatility = volatility*0.97 + (0.5+Math.random()*1.5)*0.03;

    // Trend regime changes
    if(Math.random()<0.04){
      trend = (Math.random()-0.5)*0.8;
      trendStrength = 5 + Math.floor(Math.random()*20);
    }
    if(trendStrength>0) trendStrength--;
    else trend *= 0.92;

    const curV = v * volatility;
    const bodyMove = (Math.random()-0.48+trend*0.1)*curV;
    const o = p;
    const c = +(p + bodyMove).toFixed(2);

    // Realistic wicks - larger on high vol candles
    const wickScale = 0.3 + Math.random()*0.7;
    const upperWick = Math.random()*curV*wickScale*(Math.random()<0.3?2:1);
    const lowerWick = Math.random()*curV*wickScale*(Math.random()<0.3?2:1);
    const h = +(Math.max(o,c) + upperWick).toFixed(2);
    const l = +(Math.min(o,c) - lowerWick).toFixed(2);

    // Occasional news spikes
    const spike = Math.random()<0.02 ? (Math.random()-0.5)*curV*5 : 0;
    out.push({o, h:+(h+Math.abs(spike)).toFixed(2), l:+(l-Math.abs(spike)).toFixed(2), c:+(c+spike).toFixed(2)});
    p = +(c+spike).toFixed(2);
    // Prevent price going negative
    if(p<base*0.5) p=base*0.5;
    if(p>base*2) p=base*1.5;
  }
  return out;
}

const SYMS=["NQ","ES","MGC","GC","CL","BTC","ETH"];
const fmt$=(n:number)=>(n>=0?"+":"")+`$${Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

// -- Main ----------------------------------------------------------------------
export default function SimulatorPage() {
  const { simShowLevels } = useStore();
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const drawingCanvasRef=useRef<HTMLCanvasElement>(null);
  const [drawTool, setDrawTool] = useState<"none"|"line"|"rect"|"pencil">("none");
  const [drawColor, setDrawColor] = useState("#00e5ff");
  const [drawings, setDrawings] = useState<{type:string;pts:number[];color:string}[]>([]);
  const isDrawing = useRef(false);
  const drawStart = useRef<{x:number;y:number}|null>(null);
  const currentPath = useRef<number[]>([]);
  const tickRef=useRef<any>(null);

  const [accounts, setAccounts]   = useState<SimAccount[]>([]);
  const [activeId, setActiveId]   = useState<string>("");
  const [newName,  setNewName]    = useState("");
  const [showNew,  setShowNew]    = useState(false);
  const [showLB,        setShowLB]        = useState(false);
  const [chartColors,   setChartColors]   = useState({up:"#00e676",down:"#ff1744",bg:"#060a0f"});
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [leaderboard,setLB]       = useState<any[]>([]);

  const [symbol,   setSymbol]     = useState("NQ");
  const [candles,  setCandles]    = useState<Candle[]>([]);
  const [cur,      setCur]        = useState(80);
  const [viewCount, setViewCount] = useState(80);  // how many candles visible
  const [viewOff,  setViewOff]   = useState(0);   // pan offset from right edge
  const isPanning = useRef(false);
  const panStart  = useRef<{x:number;panOff:number}|null>(null);
  const [playing,  setPlaying]    = useState(false);
  const [speed,    setSpeed]      = useState(1);
  const [inTrade,  setInTrade]    = useState(false);
  const [side,     setSide]       = useState<"LONG"|"SHORT">("LONG");
  const [entry,    setEntry]      = useState(0);
  const [tp,       setTp]         = useState("20");
  const [sl,       setSl]         = useState("10");
  const [ghostEntry, setGhostEntry] = useState(0);
  const [ghostTp,    setGhostTp]    = useState(0);
  const [ghostSl,    setGhostSl]    = useState(0);

  const activeAcc = accounts.find(a=>a.id===activeId);

  // Load on mount
  useEffect(()=>{
    const accs=loadAccounts();
    if(accs.length){
      setAccounts(accs);
      setActiveId(accs[0].id);
    } else {
      // Create default account
      const def=newAccount("Main Account");
      saveAccounts([def]);
      setAccounts([def]);
      setActiveId(def.id);
    }
    setLB(JSON.parse(localStorage.getItem(LB_KEY)||"[]"));
  },[]);

  // Reset chart when symbol changes
  useEffect(()=>{
    setCandles(genCandles(symbol));
    setCur(80); setPlaying(false); setInTrade(false);
  },[symbol]);

  // Redraw drawing overlay
  useEffect(()=>{
    const dc=drawingCanvasRef.current; if(!dc) return;
    const dpr=window.devicePixelRatio||1;
    dc.width=dc.offsetWidth*dpr; dc.height=dc.offsetHeight*dpr;
    const ctx=dc.getContext("2d")!; ctx.scale(dpr,dpr);
    ctx.clearRect(0,0,dc.offsetWidth,dc.offsetHeight);
    drawings.forEach(d=>{
      ctx.strokeStyle=d.color; ctx.lineWidth=2; ctx.lineCap="round";
      if(d.type==="line"&&d.pts.length===4){
        ctx.beginPath(); ctx.moveTo(d.pts[0],d.pts[1]); ctx.lineTo(d.pts[2],d.pts[3]); ctx.stroke();
      } else if(d.type==="rect"&&d.pts.length===4){
        ctx.strokeRect(d.pts[0],d.pts[1],d.pts[2]-d.pts[0],d.pts[3]-d.pts[1]);
        ctx.fillStyle=d.color+"22"; ctx.fillRect(d.pts[0],d.pts[1],d.pts[2]-d.pts[0],d.pts[3]-d.pts[1]);
      } else if(d.type==="pencil"&&d.pts.length>=4){
        ctx.beginPath(); ctx.moveTo(d.pts[0],d.pts[1]);
        for(let i=2;i<d.pts.length;i+=2) ctx.lineTo(d.pts[i],d.pts[i+1]);
        ctx.stroke();
      }
    });
  },[drawings]);

  const getPos=(e:React.MouseEvent<HTMLCanvasElement>)=>{
    const r=e.currentTarget.getBoundingClientRect();
    return{x:e.clientX-r.left,y:e.clientY-r.top};
  };
  const onDrawMouseDown=(e:React.MouseEvent<HTMLCanvasElement>)=>{
    if(drawTool==="none") return;
    const p=getPos(e); isDrawing.current=true; drawStart.current=p;
    if(drawTool==="pencil") currentPath.current=[p.x,p.y];
  };
  const onDrawMouseMove=(e:React.MouseEvent<HTMLCanvasElement>)=>{
    if(!isDrawing.current||drawTool==="none"||!drawStart.current) return;
    const p=getPos(e);
    if(drawTool==="pencil"){
      currentPath.current=[...currentPath.current,p.x,p.y];
      // Live preview
      const dc=drawingCanvasRef.current; if(!dc) return;
      const dpr=window.devicePixelRatio||1;
      dc.width=dc.offsetWidth*dpr; dc.height=dc.offsetHeight*dpr;
      const ctx=dc.getContext("2d")!; ctx.scale(dpr,dpr);
      ctx.clearRect(0,0,dc.offsetWidth,dc.offsetHeight);
      drawings.forEach(d=>{
        ctx.strokeStyle=d.color; ctx.lineWidth=2; ctx.lineCap="round";
        if(d.type==="line"&&d.pts.length===4){ctx.beginPath();ctx.moveTo(d.pts[0],d.pts[1]);ctx.lineTo(d.pts[2],d.pts[3]);ctx.stroke();}
        else if(d.type==="rect"&&d.pts.length===4){ctx.strokeRect(d.pts[0],d.pts[1],d.pts[2]-d.pts[0],d.pts[3]-d.pts[1]);ctx.fillStyle=d.color+"22";ctx.fillRect(d.pts[0],d.pts[1],d.pts[2]-d.pts[0],d.pts[3]-d.pts[1]);}
        else if(d.type==="pencil"){ctx.beginPath();ctx.moveTo(d.pts[0],d.pts[1]);for(let i=2;i<d.pts.length;i+=2)ctx.lineTo(d.pts[i],d.pts[i+1]);ctx.stroke();}
      });
      ctx.strokeStyle=drawColor; ctx.lineWidth=2; ctx.lineCap="round";
      ctx.beginPath(); ctx.moveTo(currentPath.current[0],currentPath.current[1]);
      for(let i=2;i<currentPath.current.length;i+=2) ctx.lineTo(currentPath.current[i],currentPath.current[i+1]);
      ctx.stroke();
    }
  };
  const onDrawMouseUp=(e:React.MouseEvent<HTMLCanvasElement>)=>{
    if(!isDrawing.current||drawTool==="none"||!drawStart.current) return;
    const p=getPos(e);
    if(drawTool==="pencil"){
      setDrawings(prev=>[...prev,{type:"pencil",pts:currentPath.current,color:drawColor}]);
      currentPath.current=[];
    } else {
      setDrawings(prev=>[...prev,{type:drawTool,pts:[drawStart.current!.x,drawStart.current!.y,p.x,p.y],color:drawColor}]);
    }
    isDrawing.current=false; drawStart.current=null;
  };

  // Draw only
  useEffect(()=>{
    const cv=canvasRef.current; if(!cv||!candles.length) return;
    const tpP=side==="LONG"?entry+(+tp):entry-(+tp);
    const slP=side==="LONG"?entry-(+sl):entry+(+sl);
    // Apply zoom/pan: show viewCount candles ending at (cur - viewOff)
    const end = Math.max(Math.min(cur - viewOff, candles.length), 1);
    const start = Math.max(end - viewCount, 0);
    const viewCandles = candles.slice(start, end);
    const viewCur = viewCandles.length;
    drawChart(cv,viewCandles,viewCur,inTrade&&simShowLevels,entry,side,tpP,slP,chartColors,simShowLevels?ghostEntry:0,simShowLevels?ghostTp:0,simShowLevels?ghostSl:0);
  },[candles,cur,inTrade,entry,side,tp,sl,chartColors,ghostEntry,ghostTp,ghostSl,simShowLevels]);

  // TP/SL auto-close check - separate effect, guarded against double-fire
  useEffect(()=>{
    if(!inTrade||!candles[cur-1]) return;
    const c=candles[cur-1];
    const tpP=side==="LONG"?entry+(+tp):entry-(+tp);
    const slP=side==="LONG"?entry-(+sl):entry+(+sl);
    if((side==="LONG"&&c.h>=tpP)||(side==="SHORT"&&c.l<=tpP)){
      closeTrade(tpP,"TP");
    } else if((side==="LONG"&&c.l<=slP)||(side==="SHORT"&&c.h>=slP)){
      closeTrade(slP,"SL");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[cur,inTrade]);

  // Timer
  useEffect(()=>{
    if(tickRef.current) clearInterval(tickRef.current);
    if(!playing) return;
    tickRef.current=setInterval(()=>{
      setCur(v=>{
        if(v>=candles.length-1){setPlaying(false);return candles.length-1;}
        return v+1;
      });
    },Math.max(50,400/speed));
    return()=>{if(tickRef.current)clearInterval(tickRef.current);};
  },[playing,speed,candles.length]);

  const closeTrade=(exitP:number,result:"TP"|"SL"|"MANUAL")=>{
    if(!inTrade) return; // guard against double-close
    // Point value per contract based on symbol
    const sym=(symbol||"NQ").toUpperCase();
    const ptVal=sym.includes("MNQ")?2:sym.includes("MES")?5:sym.includes("NQ")?20:sym.includes("ES")?50:sym.includes("MGC")?10:sym.includes("GC")?100:sym.includes("YM")?5:1;
    // Realistic commission per round-trip contract (~$4 for micros, ~$4-5 for minis)
    const commission=sym.includes("M")?1.24:4.00; // micros cheaper
    // Slippage: SL fills slightly worse, TP fills slightly worse too (0.25-0.5 pts)
    const slipPts=result==="SL"?0.5:result==="MANUAL"?0.25:0.25;
    const rawPoints=side==="LONG"?exitP-entry:entry-exitP;
    const netPoints=rawPoints-slipPts; // slippage always works against you
    const gross=netPoints*ptVal;
    const pnl=+(gross-commission).toFixed(2);
    const trade:SimTrade={side,entry,exit:exitP,pnl,result};
    setAccounts(prev=>{
      const updated=prev.map(a=>{
        if(a.id!==activeId) return a;
        const newTrades=[...a.trades,trade];
        return{...a,trades:newTrades,balance:+(a.balance+pnl).toFixed(2)};
      });
      saveAccounts(updated);
      setLB(JSON.parse(localStorage.getItem(LB_KEY)||"[]"));
      return updated;
    });
    // Save ghost lines so chart still shows where TP/SL were
    const tpPrice=side==="LONG"?entry+(+tp):entry-(+tp);
    const slPrice=side==="LONG"?entry-(+sl):entry+(+sl);
    setGhostEntry(entry); setGhostTp(tpPrice); setGhostSl(slPrice);
    setInTrade(false);
  };

  const enterTrade=(s:"LONG"|"SHORT")=>{
    if(inTrade||!candles.length) return;
    const p=candles[cur-1]?.c||candles[cur]?.c||0;
    if(!p) return;
    // Set all trade state together (batched by React)
    setGhostEntry(0); setGhostTp(0); setGhostSl(0);
    setEntry(p);
    setSide(s);
    setInTrade(true);
  };

  const createAccount=()=>{
    if(!newName.trim()) return;
    const acc=newAccount(newName.trim());
    const updated=[...accounts,acc];
    setAccounts(updated); saveAccounts(updated);
    setActiveId(acc.id); setShowNew(false); setNewName("");
    setCandles(genCandles(symbol)); setCur(80); setPlaying(false); setInTrade(false);
  };

  const resetAccount=()=>{
    if(!activeAcc||!window.confirm(`Reset "${activeAcc.name}" to $10,000?`)) return;
    setAccounts(prev=>{
      const updated=prev.map(a=>a.id===activeId?{...a,balance:10000,startBalance:10000,trades:[]}:a);
      saveAccounts(updated); return updated;
    });
    // Save ghost lines so chart still shows where TP/SL were
    const tpPrice=side==="LONG"?entry+(+tp):entry-(+tp);
    const slPrice=side==="LONG"?entry-(+sl):entry+(+sl);
    setGhostEntry(entry); setGhostTp(tpPrice); setGhostSl(slPrice);
    setInTrade(false);
  };

  const deleteAccount=()=>{
    if(!activeAcc||accounts.length<=1||!window.confirm(`Delete "${activeAcc.name}"?`)) return;
    const updated=accounts.filter(a=>a.id!==activeId);
    setAccounts(updated); saveAccounts(updated); setActiveId(updated[0].id);
  };

  const curPrice=candles[cur-1]?.c||0;
  const simPtVal=(()=>{const s=(symbol||"NQ").toUpperCase();return s.includes("MNQ")?2:s.includes("MES")?5:s.includes("NQ")?20:s.includes("ES")?50:s.includes("MGC")?10:s.includes("GC")?100:s.includes("YM")?5:1;})();
  const openPnl=inTrade?+((side==="LONG"?curPrice-entry:entry-curPrice)*simPtVal).toFixed(2):0;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>

      {/* Account bar */}
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(0,0,0,0.25)",flexShrink:0,overflowX:"auto"}}>
        {accounts.map(a=>(
          <button key={a.id} onClick={()=>{setActiveId(a.id);setInTrade(false);}} style={{
            height:32,padding:"0 12px",borderRadius:9,border:"1px solid",flexShrink:0,
            borderColor:a.id===activeId?"rgba(0,229,255,0.4)":"rgba(255,255,255,0.08)",
            background:a.id===activeId?"rgba(0,229,255,0.1)":"rgba(255,255,255,0.03)",
            color:a.id===activeId?"#00e5ff":"#6b7280",cursor:"pointer",
          }}>
            <span style={{fontSize:11,fontWeight:700}}>{a.name}</span>
            <span style={{fontSize:10,marginLeft:6,fontFamily:"monospace",color:(a.balance-a.startBalance)>=0?"#00e676":"#ff1744"}}>
              ${a.balance.toLocaleString("en-US",{minimumFractionDigits:0})}
            </span>
          </button>
        ))}
        <button onClick={()=>setShowNew(true)} style={{height:32,padding:"0 10px",borderRadius:9,border:"1px dashed rgba(255,255,255,0.15)",background:"transparent",color:"#4b5563",cursor:"pointer",fontSize:12,fontWeight:700,flexShrink:0}}>+ New</button>
        <button onClick={resetAccount} title="Reset account" style={{height:32,padding:"0 10px",borderRadius:9,border:"1px solid rgba(255,171,0,0.2)",background:"rgba(255,171,0,0.06)",color:"#ffab00",cursor:"pointer",fontSize:11,flexShrink:0}}>Reset</button>
        {accounts.length>1&&<button onClick={deleteAccount} style={{height:32,padding:"0 10px",borderRadius:9,border:"1px solid rgba(255,23,68,0.2)",background:"rgba(255,23,68,0.06)",color:"#f87171",cursor:"pointer",fontSize:11,flexShrink:0}}>Delete</button>}
        <button onClick={async()=>{
  setShowLB(l=>!l);
  // Try global leaderboard first, fall back to local
  try {
    const global = await getGlobalLeaderboard();
    if (global.length > 0) {
      setLB(global.map((e:any) => ({ name: e.username + " / " + e.account_name, balance: e.balance, startBalance: e.start_balance, trades: e.total_trades, wins: e.wins })));
    } else {
      setLB(JSON.parse(localStorage.getItem(LB_KEY)||"[]"));
    }
  } catch {
    setLB(JSON.parse(localStorage.getItem(LB_KEY)||"[]"));
  }
}} style={{height:32,padding:"0 12px",borderRadius:9,border:"1px solid rgba(213,0,249,0.25)",background:"rgba(213,0,249,0.08)",color:"#d500f9",cursor:"pointer",fontSize:11,fontWeight:700,marginLeft:"auto",flexShrink:0}}>🏆 Leaderboard</button>
        <div style={{position:"relative",flexShrink:0}}>
          <button onClick={()=>setShowColorPicker(p=>!p)} style={{height:32,padding:"0 12px",borderRadius:9,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)",color:"#8b949e",cursor:"pointer",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",gap:6}}>
            <span style={{width:10,height:10,borderRadius:"50%",background:chartColors.up,display:"inline-block"}}/>
            <span style={{width:10,height:10,borderRadius:"50%",background:chartColors.down,display:"inline-block"}}/>
            Colors
          </button>
          {showColorPicker&&(
            <div style={{position:"absolute",top:36,right:0,zIndex:999,background:"#0f1520",border:"1px solid rgba(255,255,255,0.12)",borderRadius:12,padding:14,display:"flex",flexDirection:"column",gap:10,minWidth:180}}>
              {([["Bullish",chartColors.up,"up"],["Bearish",chartColors.down,"down"],["Background",chartColors.bg,"bg"]] as const).map(([lbl,val,key])=>(
                <div key={key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                  <span style={{fontSize:12,color:"#8b949e"}}>{lbl}</span>
                  <input type="color" value={val} onChange={e=>setChartColors(c=>({...c,[key]:e.target.value}))} style={{width:32,height:24,borderRadius:6,border:"none",cursor:"pointer",background:"none"}}/>
                </div>
              ))}
              {[["Classic","#00e676","#ff1744","#060a0f"],["TradingView","#26a69a","#ef5350","#131722"],["Monochrome","#ffffff","#ffffff","#1a1a1a"],["Light","#089981","#f23645","#f0f2f5"]].map(([name,up,down,bg])=>(
                <button key={name} onClick={()=>{setChartColors({up,down,bg});}} style={{height:26,borderRadius:7,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.03)",color:"#8b949e",cursor:"pointer",fontSize:11}}>{name}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Controls bar */}
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 14px",borderBottom:"1px solid rgba(255,255,255,0.05)",background:"rgba(0,0,0,0.15)",flexShrink:0,flexWrap:"wrap" as const}}>
        <select value={symbol} onChange={e=>{setSymbol(e.target.value);}} style={{height:30,padding:"0 8px",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:7,color:"#f0f6fc",fontSize:12,fontWeight:700}}>
          {SYMS.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={()=>{setCandles(genCandles(symbol));setCur(80);setPlaying(false);setInTrade(false);}} style={{height:30,padding:"0 10px",borderRadius:7,border:"1px solid rgba(255,255,255,0.09)",background:"rgba(255,255,255,0.04)",color:"#6b7280",cursor:"pointer",fontSize:12}}>New Chart</button>
        <div style={{width:1,height:18,background:"rgba(255,255,255,0.08)"}}/>
        <button onClick={()=>setPlaying(p=>!p)} style={{width:32,height:32,borderRadius:9,border:"1px solid rgba(0,229,255,0.3)",background:playing?"rgba(0,229,255,0.2)":"rgba(0,229,255,0.08)",color:"#00e5ff",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>
          {playing?"⏸":"▶"}
        </button>
        {[1,2,4,8].map(s=>(
          <button key={s} onClick={()=>setSpeed(s)} style={{height:26,padding:"0 8px",borderRadius:6,border:"1px solid",borderColor:speed===s?"rgba(0,229,255,0.4)":"rgba(255,255,255,0.07)",background:speed===s?"rgba(0,229,255,0.1)":"transparent",color:speed===s?"#00e5ff":"#4b5563",fontSize:11,fontWeight:700,cursor:"pointer"}}>{s}×</button>
        ))}
        <div style={{width:1,height:18,background:"rgba(255,255,255,0.08)"}}/>
        <span style={{fontSize:10,color:"#3d4551"}}>TP</span>
        <input value={tp} onChange={e=>setTp(e.target.value)} type="number" style={{width:52,height:28,padding:"0 6px",background:"rgba(0,230,118,0.06)",border:"1px solid rgba(0,230,118,0.2)",borderRadius:6,color:"#00e676",fontSize:12,textAlign:"center",outline:"none"}}/>
        <span style={{fontSize:10,color:"#3d4551"}}>SL</span>
        <input value={sl} onChange={e=>setSl(e.target.value)} type="number" style={{width:52,height:28,padding:"0 6px",background:"rgba(255,23,68,0.06)",border:"1px solid rgba(255,23,68,0.2)",borderRadius:6,color:"#ff1744",fontSize:12,textAlign:"center",outline:"none"}}/>
        <div style={{width:1,height:18,background:"rgba(255,255,255,0.08)"}}/>
        {!inTrade?(
          <>
            <button onClick={()=>enterTrade("LONG")} disabled={!candles.length} style={{height:30,padding:"0 14px",borderRadius:8,border:"none",background:candles.length?"#00e676":"rgba(0,230,118,0.2)",color:candles.length?"#000":"#374151",cursor:candles.length?"pointer":"default",fontSize:12,fontWeight:800}}>▲ LONG</button>
            <button onClick={()=>enterTrade("SHORT")} disabled={!candles.length} style={{height:30,padding:"0 14px",borderRadius:8,border:"none",background:candles.length?"#ff1744":"rgba(255,23,68,0.2)",color:candles.length?"#fff":"#374151",cursor:candles.length?"pointer":"default",fontSize:12,fontWeight:800}}>▼ SHORT</button>
          </>
        ):(
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize:12,fontFamily:"monospace",color:side==="LONG"?"#00e676":"#ff1744",fontWeight:700}}>{side} @ {entry.toFixed(2)}</span>
            <span style={{fontSize:13,fontWeight:800,fontFamily:"monospace",color:openPnl>=0?"#00e676":"#ff1744"}}>{openPnl>=0?"+":""}{openPnl.toFixed(2)}</span>
            <button onClick={()=>closeTrade(curPrice,"MANUAL")} style={{height:28,padding:"0 12px",borderRadius:8,border:"1px solid rgba(255,171,0,0.3)",background:"rgba(255,171,0,0.1)",color:"#ffab00",cursor:"pointer",fontSize:11,fontWeight:700}}>Close</button>
          </div>
        )}
        <div style={{marginLeft:"auto",textAlign:"right" as const,flexShrink:0}}>
          <div style={{fontSize:9,color:"#3d4551",textTransform:"uppercase" as const}}>Balance</div>
          <div style={{fontSize:15,fontWeight:900,fontFamily:"monospace",color:(activeAcc?.balance||0)>=10000?"#00e676":"#ff1744"}}>
            ${(activeAcc?.balance||10000).toLocaleString("en-US",{minimumFractionDigits:0})}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div style={{flex:1,position:"relative",minHeight:0,background:chartColors.bg}}>
        <canvas ref={canvasRef} style={{width:"100%",height:"100%",display:"block",position:"absolute",inset:0}}/>
        {/* Drawing overlay */}
        <canvas ref={drawingCanvasRef}
          style={{width:"100%",height:"100%",display:"block",position:"absolute",inset:0,background:"transparent",cursor:drawTool==="none"?"default":drawTool==="pencil"?"crosshair":"crosshair",zIndex:2}}
          onMouseDown={onDrawMouseDown} onMouseMove={onDrawMouseMove} onMouseUp={onDrawMouseUp} onMouseLeave={onDrawMouseUp}
        />
        {/* Drawing toolbar */}
        <div style={{position:"absolute",top:8,right:8,zIndex:3,display:"flex",flexDirection:"column",gap:4,background:"rgba(0,0,0,0.6)",borderRadius:10,padding:6,border:"1px solid rgba(255,255,255,0.08)"}}>
          {([["none","✕","Cursor"],["line","╱","Line"],["rect","▭","Rect"],["pencil","✏","Draw"]] as const).map(([t,icon,label])=>(
            <button key={t} onClick={()=>setDrawTool(t)} title={label} style={{width:28,height:28,borderRadius:6,border:"1px solid",borderColor:drawTool===t?"rgba(0,229,255,0.5)":"rgba(255,255,255,0.1)",background:drawTool===t?"rgba(0,229,255,0.15)":"transparent",color:drawTool===t?"#00e5ff":"#6b7280",cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>{icon}</button>
          ))}
          <div style={{width:28,height:1,background:"rgba(255,255,255,0.1)"}}/>
          {["#00e5ff","#00e676","#ff1744","#ffab00","#ffffff","#d500f9"].map(c=>(
            <button key={c} onClick={()=>setDrawColor(c)} style={{width:28,height:28,borderRadius:6,border:`2px solid ${drawColor===c?"#fff":"transparent"}`,background:c,cursor:"pointer"}}/>
          ))}
          <div style={{width:28,height:1,background:"rgba(255,255,255,0.1)"}}/>
          <button onClick={()=>setDrawings([])} title="Clear" style={{width:28,height:28,borderRadius:6,border:"1px solid rgba(255,23,68,0.3)",background:"rgba(255,23,68,0.1)",color:"#ff1744",cursor:"pointer",fontSize:10}}>⌫</button>
        </div>
        <div style={{position:"absolute",top:8,left:12,fontSize:10,color:"#3d4551",fontFamily:"monospace"}}>{symbol} · {cur}/{candles.length}</div>
      </div>

      {/* Trade log */}
      {activeAcc&&activeAcc.trades.length>0&&(
        <div style={{borderTop:"1px solid rgba(255,255,255,0.06)",background:"rgba(0,0,0,0.2)",padding:"8px 14px",maxHeight:100,overflowY:"auto",flexShrink:0}}>
          <div style={{fontSize:9,color:"#3d4551",textTransform:"uppercase" as const,letterSpacing:"0.07em",marginBottom:4}}>
            Trade Log · {activeAcc.trades.length} trades · {activeAcc.trades.filter(t=>t.pnl>0).length}W {activeAcc.trades.filter(t=>t.pnl<=0).length}L
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap" as const}}>
            {[...activeAcc.trades].reverse().slice(0,20).map((t,i)=>(
              <div key={i} style={{padding:"2px 8px",borderRadius:6,fontSize:11,fontWeight:700,background:t.pnl>=0?"rgba(0,230,118,0.1)":"rgba(255,23,68,0.1)",color:t.pnl>=0?"#00e676":"#ff1744"}}>
                {t.side[0]} {t.result} {t.pnl>=0?"+":""}{t.pnl.toFixed(1)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mini Analytics */}
      {activeAcc&&activeAcc.trades.length>0&&(()=>{
        const ts=activeAcc.trades;
        const wins=ts.filter(t=>t.pnl>0);
        const losses=ts.filter(t=>t.pnl<=0);
        const wr=ts.length>0?wins.length/ts.length*100:0;
        const avgW=wins.length>0?wins.reduce((s,t)=>s+t.pnl,0)/wins.length:0;
        const avgL=losses.length>0?Math.abs(losses.reduce((s,t)=>s+t.pnl,0)/losses.length):0;
        const expectancy=wr/100*avgW-(1-wr/100)*avgL;
        const totalPnl=activeAcc.balance-activeAcc.startBalance;
        const pf=avgL>0?avgW/avgL:0;
        return (
          <div style={{borderTop:"1px solid rgba(255,255,255,0.06)",background:"rgba(0,0,0,0.15)",padding:"10px 14px",flexShrink:0}}>
            <div style={{fontSize:9,color:"#3d4551",textTransform:"uppercase" as const,letterSpacing:"0.07em",marginBottom:8}}>Session Analytics</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8}}>
              {[
                {l:"Net P&L",   v:`${totalPnl>=0?"+":""}$${totalPnl.toFixed(2)}`, c:totalPnl>=0?"#00e676":"#ff1744"},
                {l:"Win Rate",  v:`${wr.toFixed(0)}%`,   c:wr>=50?"#00e676":"#ff1744"},
                {l:"Avg Win",   v:`$${avgW.toFixed(2)}`, c:"#00e676"},
                {l:"Avg Loss",  v:`-$${avgL.toFixed(2)}`,c:"#ff1744"},
                {l:"Prof Factor",v:pf.toFixed(2),         c:pf>=1?"#00e5ff":"#ffab00"},
                {l:"Expectancy",v:`$${expectancy.toFixed(2)}`,c:expectancy>=0?"#00e5ff":"#ff1744"},
              ].map(s=>(
                <div key={s.l} style={{background:"rgba(255,255,255,0.03)",borderRadius:8,padding:"6px 8px",textAlign:"center" as const}}>
                  <div style={{fontSize:8,color:"#4b5563",textTransform:"uppercase" as const,letterSpacing:"0.06em",marginBottom:2}}>{s.l}</div>
                  <div style={{fontSize:12,fontWeight:800,color:s.c,fontFamily:"monospace"}}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* New account modal */}
      {showNew&&(
        <div onClick={e=>{if(e.target===e.currentTarget)setShowNew(false);}} style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{width:340,background:"linear-gradient(160deg,#0f1520,#0b1017)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:16,padding:24}}>
            <div style={{fontSize:15,fontWeight:800,color:"#f0f6fc",marginBottom:16}}>New Sim Account</div>
            <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createAccount()}
              placeholder="Account name..." autoFocus
              style={{width:"100%",height:40,padding:"0 12px",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:9,color:"#f0f6fc",fontSize:14,outline:"none",boxSizing:"border-box" as const}}/>
            <div style={{fontSize:11,color:"#4b5563",marginTop:6}}>Starts with $10,000 virtual balance</div>
            <div style={{display:"flex",gap:8,marginTop:16}}>
              <button onClick={()=>setShowNew(false)} style={{flex:1,height:36,borderRadius:9,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.04)",color:"#6b7280",cursor:"pointer",fontSize:13}}>Cancel</button>
              <button onClick={createAccount} style={{flex:2,height:36,borderRadius:9,border:"none",background:"linear-gradient(135deg,#00e5ff,#0088bb)",color:"#000",cursor:"pointer",fontSize:13,fontWeight:800}}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      {showLB&&(
        <div onClick={e=>{if(e.target===e.currentTarget)setShowLB(false);}} style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{width:"100%",maxWidth:500,background:"linear-gradient(160deg,#0f1520,#0b1017)",border:"1px solid rgba(213,0,249,0.2)",borderRadius:18,overflow:"hidden",boxShadow:"0 0 60px rgba(213,0,249,0.1)"}}>
            <div style={{padding:"14px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(0,0,0,0.3)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontSize:15,fontWeight:800,color:"#f0f6fc"}}>🏆 Simulator Leaderboard</div>
              <button onClick={()=>setShowLB(false)} style={{width:28,height:28,borderRadius:8,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",color:"#4b5563",cursor:"pointer",fontSize:17,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>
            <div style={{padding:16}}>
              {leaderboard.length===0?(
                <div style={{textAlign:"center" as const,padding:"32px 0",color:"#374151",fontSize:13}}>No accounts yet — start trading!</div>
              ):leaderboard.map((entry,i)=>{
                const pnl=entry.balance-entry.startBalance;
                const wr=entry.trades>0?Math.round(entry.wins/entry.trades*100):0;
                return (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,background:i===0?"rgba(213,0,249,0.08)":"rgba(255,255,255,0.02)",border:`1px solid ${i===0?"rgba(213,0,249,0.2)":"rgba(255,255,255,0.04)"}`,marginBottom:6}}>
                    <div style={{fontSize:18,width:28,textAlign:"center" as const}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:"#f0f6fc"}}>{entry.name}</div>
                      <div style={{fontSize:10,color:"#4b5563"}}>{entry.trades} trades · {wr}% WR</div>
                    </div>
                    <div style={{textAlign:"right" as const}}>
                      <div style={{fontSize:15,fontWeight:900,fontFamily:"monospace",color:pnl>=0?"#00e676":"#ff1744"}}>{fmt$(pnl)}</div>
                      <div style={{fontSize:11,color:"#4b5563",fontFamily:"monospace"}}>${entry.balance.toLocaleString()}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
