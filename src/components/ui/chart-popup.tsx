"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { PricingModal } from "@/components/subscription/pro-gate";
import { useSubscription } from "@/hooks/useSubscription";
import { useStore } from "@/store";
import { useAccountStore } from "@/store/accounts";
import {
  createChart, IChartApi, ISeriesApi,
  CandlestickSeries, createSeriesMarkers,
  CrosshairMode, LineStyle, Time,
} from "lightweight-charts";

// -- Types ----------------------------------------------------------------------
interface Candle { t: number; o: number; h: number; l: number; c: number; }
interface Props {
  ticker: string; entryTime: string; exitTime?: string|null;
  side: string; entryPrice: number; exitPrice?: number|null;
  stopLoss?: number|null; takeProfit?: number|null;
  netPnl?: number|null; onClose: () => void; onSaveLevels?: (sl:number|null,tp:number|null)=>void;
}
type Tool = "cursor"|"trendline"|"line"|"hline"|"rect"|"text";
interface Drawing { id:string; type:Tool; pts:{x:number;y:number}[]; color:string; text?:string; extended?:boolean; }

// -- Symbol mapping -------------------------------------------------------------
function toYahoo(ticker: string): string {
  const root = ticker.toUpperCase().replace(/\d+!$/,"").replace(/!$/,"").replace(/[A-Z]\d{2,4}$/,"").trim();
  const m: Record<string,string> = {
    NQ:"NQ=F",MNQ:"MNQ=F",ES:"ES=F",MES:"MES=F",YM:"YM=F",MYM:"MYM=F",
    RTY:"RTY=F",M2K:"M2K=F",CL:"CL=F",GC:"GC=F",MGC:"MGC=F",
    SI:"SI=F",NG:"NG=F",ZN:"ZN=F",ZB:"ZB=F",
    "6E":"EURUSD=X","6J":"JPYUSD=X","6B":"GBPUSD=X",
    BTC:"BTC-USD",ETH:"ETH-USD",SOL:"SOL-USD",
  };
  return m[root]||root;
}

// -- Fetch via server-side proxy (no CORS issues) ------------------------------
async function fetchCandles(sym:string,from:number,to:number): Promise<Candle[]> {
  const url = `/api/chart?sym=${encodeURIComponent(sym)}&from=${from}&to=${to}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) {
      const err = await r.json().catch(()=>({error:`HTTP ${r.status}`}));
      throw new Error(err.error || `HTTP ${r.status}`);
    }
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    if (!res) throw new Error("No chart data returned");
    const ts:number[] = res.timestamp || [];
    const q = res.indicators?.quote?.[0] || {};
    const out = ts.map((t,i)=>({t,o:q.open?.[i],h:q.high?.[i],l:q.low?.[i],c:q.close?.[i]}))
                   .filter(c=>c.o!=null&&isFinite(c.o)&&c.h!=null&&c.l!=null&&c.c!=null) as Candle[];
    if (!out.length) throw new Error("No candles in response — data may be too old (Yahoo Finance only keeps 30 days of 1-min data)");
    return out;
  } catch(e) {
    throw new Error(String(e).replace("Error: ",""));
  }
}

// -- Helpers --------------------------------------------------------------------
const f$=(n:number)=>(n>=0?"+":"")+`$${Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fP=(n:number)=>n>=100?n.toFixed(2):n>=1?n.toFixed(4):n.toFixed(6);
const fT=(ts:number)=>new Date(ts*1000).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
const fDT=(ts:number)=>new Date(ts*1000).toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false});

const BARS_PAD = 15; // bars before entry and after exit

// -- Main popup -----------------------------------------------------------------
function TradeReplayPopup({ticker,entryTime,exitTime,side,entryPrice,exitPrice,stopLoss,takeProfit,netPnl,onClose,onSaveLevels}:Props) {
  const { replayShowLevels } = useStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef   = useRef<HTMLCanvasElement>(null);
  const chartRef     = useRef<IChartApi|null>(null);
  const serRef       = useRef<ISeriesApi<"Candlestick">|null>(null);
  const markersRef   = useRef<ReturnType<typeof createSeriesMarkers<Time>>|null>(null);
  const priceLines   = useRef<ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[]>([]);
  const tickRef      = useRef<ReturnType<typeof setInterval>|null>(null);

  const [allCandles,  setAllCandles]  = useState<Candle[]>([]);
  const [status,      setStatus]      = useState<"loading"|"error"|"ok">("loading");
  const [errMsg,      setErrMsg]      = useState("");
  const [visible,     setVisible]     = useState(1);
  const [playing,     setPlaying]     = useState(false);
  const [speed,       setSpeed]       = useState(1);
  const [tool,        setTool]        = useState<Tool>("cursor");
  const [color,       setColor]       = useState("#00e5ff");
  const [drawings,    setDrawings]    = useState<Drawing[]>([]);
  const [chartColors, setChartColors] = useState({up:"#26a69a",down:"#ef5350",bg:"#131722"});
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [drawing,     setDrawing]     = useState<Drawing|null>(null);
  const [pendingPt,   setPendingPt]   = useState<{x:number;y:number}|null>(null); // first click for trendline
  const [selected,    setSelected]    = useState<string|null>(null);   // selected drawing id
  const [dragging,    setDragging]    = useState<{id:string;ptIdx:number;ox:number;oy:number}|null>(null);

  const [localTp, setLocalTp] = useState<string>(takeProfit!=null?String(takeProfit):"");
  const [localSl, setLocalSl] = useState<string>(stopLoss!=null?String(stopLoss):"");

  const entryTs = useMemo(()=>Math.floor(new Date(entryTime).getTime()/1000),[entryTime]);
  const exitTs  = useMemo(()=>exitTime?Math.floor(new Date(exitTime).getTime()/1000):null,[exitTime]);
  const isPos   = (netPnl??0)>=0;

  // -- Init chart ------------------------------------------------------------
  useEffect(()=>{
    if(!containerRef.current) return;
    const chart=createChart(containerRef.current,{
      layout:{ background:{color:chartColors.bg}, textColor:"#4b5563", fontFamily:"'JetBrains Mono',monospace", fontSize:10 },
      grid:{ vertLines:{color:"rgba(255,255,255,0.04)"}, horzLines:{color:"rgba(255,255,255,0.04)"} },
      crosshair:{ mode:CrosshairMode.Normal },
      rightPriceScale:{ borderColor:"rgba(255,255,255,0.08)" },
      timeScale:{ borderColor:"rgba(255,255,255,0.08)", timeVisible:true, secondsVisible:true },
      handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:true},
      handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:true},
    });
    chartRef.current=chart;

    const ser=chart.addSeries(CandlestickSeries,{
      upColor:chartColors.up,downColor:chartColors.down,
      borderUpColor:chartColors.up,borderDownColor:chartColors.down,
      wickUpColor:chartColors.up+"aa",wickDownColor:chartColors.down+"aa",
    });
    serRef.current=ser;

    // Create markers plugin once
    markersRef.current=createSeriesMarkers(ser,[]);

    const ro=new ResizeObserver(()=>{
      if(containerRef.current) chart.resize(containerRef.current.offsetWidth,containerRef.current.offsetHeight);
    });
    if(containerRef.current) ro.observe(containerRef.current);
    return()=>{ ro.disconnect(); chart.remove(); chartRef.current=null; serRef.current=null; markersRef.current=null; };
  },[chartColors]);

  // -- Fetch -----------------------------------------------------------------
  useEffect(()=>{
    let dead=false;
    setStatus("loading"); setAllCandles([]); setPlaying(false);
    const sym=toYahoo(ticker);
    // Fetch generous window: 2h before entry, 2h after exit
    fetchCandles(sym,entryTs-7200,(exitTs??entryTs)+7200)
      .then(data=>{
        if(dead) return;
        if(!data.length){setStatus("error");setErrMsg("Empty response");return;}
        // Find entry/exit indices
        const ei=data.findIndex(c=>c.t>=entryTs);
        const xi=exitTs?data.findIndex(c=>c.t>=exitTs):ei;
        const si=Math.max(0,(ei>=0?ei:0)-BARS_PAD);
        const ei2=Math.min(data.length-1,(xi>=0?xi:ei>=0?ei:data.length-1)+BARS_PAD);
        const win=data.slice(si,ei2+1);
        if(!win.length){setStatus("error");setErrMsg("No candles in window");return;}
        setAllCandles(win);
        setVisible(1);
        setStatus("ok");
      })
      .catch(e=>{if(!dead){setStatus("error");setErrMsg(String(e));}});
    return()=>{dead=true;};
  },[ticker,entryTs,exitTs]);

  // -- Update chart data as replay advances ----------------------------------
  useEffect(()=>{
    const ser=serRef.current;
    const chart=chartRef.current;
    const markers=markersRef.current;
    if(!ser||!chart||!markers||!allCandles.length) return;

    const slice=allCandles.slice(0,Math.max(1,visible));

    // Set candle data
    ser.setData(slice.map(c=>({time:c.t as Time,open:c.o,high:c.h,low:c.l,close:c.c})));

    // Remove old price lines
    priceLines.current.forEach(l=>{ try{ser.removePriceLine(l);}catch{} });
    priceLines.current=[];

    // Entry/Exit horizontal lines removed - arrows mark the levels instead.
    if(replayShowLevels){
      const slVal=parseFloat(localSl); const tpVal=parseFloat(localTp);
      if(!isNaN(slVal)&&slVal>0) priceLines.current.push(ser.createPriceLine({
        price:slVal, color:"#ff1744", lineWidth:2,
        lineStyle:LineStyle.Dashed, axisLabelVisible:true, title:"SL",
      }));
      if(!isNaN(tpVal)&&tpVal>0) priceLines.current.push(ser.createPriceLine({
        price:tpVal, color:"#00e676", lineWidth:2,
        lineStyle:LineStyle.Dashed, axisLabelVisible:true, title:"TP",
      }));
      // Fit price scale to include SL/TP levels
      const validPrices=[slVal,tpVal].filter(v=>!isNaN(v)&&v>0);
      if(validPrices.length&&chart){
        try{
          const ps=chart.priceScale("right");
          const cur=ps.getVisibleRange();
          if(cur){
            const all=[...validPrices,cur.from,cur.to];
            const lo=Math.min(...all),hi=Math.max(...all),pad=(hi-lo)*0.08||10;
            ps.setVisibleRange({from:lo-pad,to:hi+pad});
          }
        }catch{}
      }
    }

    // Entry / exit arrow markers
    const mks: Parameters<typeof markers.setMarkers>[0]=[];
    // Find the candle that CONTAINS the timestamp (last bar with open time <= ts).
    // Candle timestamps are bar-open times, so a fill mid-bar belongs to that bar.
    const findBar=(ts:number)=>{
      let match=slice[0];
      for(const c of slice){
        if(c.t<=ts) match=c;
        else break;
      }
      // If ts is before all candles, use the first; if after, use the last
      return match||slice[slice.length-1];
    };
    const entryC=findBar(entryTs);
    if(entryC) mks.push({
      time:entryC.t as Time,
      position:side==="LONG"?"belowBar":"aboveBar",
      color:"#00e5ff",
      shape:side==="LONG"?"arrowUp":"arrowDown",
      text:side==="LONG"?`▲ BUY @ ${fP(entryPrice)}`:`▼ SELL @ ${fP(entryPrice)}`,
      size:2,
    });
    if(exitTs&&exitPrice){
      const exitC=findBar(exitTs);
      if(exitC) mks.push({
        time:exitC.t as Time,
        position:side==="LONG"?"aboveBar":"belowBar",
        color:"#ff6b35",
        shape:side==="LONG"?"arrowDown":"arrowUp",
        text:side==="LONG"?`▼ SELL @ ${fP(exitPrice)}`:`▲ BUY @ ${fP(exitPrice)}`,
        size:2,
      });
    }
    if(markers) markers.setMarkers(mks);

    // Auto-fit when replay finishes
    if(visible>=allCandles.length) chart.timeScale().fitContent();
  },[allCandles,visible,entryTs,exitTs,entryPrice,exitPrice,stopLoss,takeProfit,side,replayShowLevels,localSl,localTp]);

  // -- Replay timer ----------------------------------------------------------
  useEffect(()=>{
    if(tickRef.current) clearInterval(tickRef.current);
    if(!playing||!allCandles.length) return;
    tickRef.current=setInterval(()=>{
      setVisible(v=>{
        if(v>=allCandles.length){setPlaying(false);return allCandles.length;}
        return Math.min(v+speed,allCandles.length);
      });
    },150);
    return()=>{ if(tickRef.current) clearInterval(tickRef.current); };
  },[playing,speed,allCandles.length]);

  // -- Drawing overlay -------------------------------------------------------
  useEffect(()=>{
    const canvas=overlayRef.current; if(!canvas) return;
    const ctx=canvas.getContext("2d"); if(!ctx) return;
    const dpr=window.devicePixelRatio||1;
    const W=canvas.offsetWidth, H=canvas.offsetHeight;
    if(!W||!H) return;
    canvas.width=W*dpr; canvas.height=H*dpr;
    ctx.scale(dpr,dpr);
    ctx.clearRect(0,0,W,H);

    // Extend a line infinitely across the canvas
    const extendLine=(x1:number,y1:number,x2:number,y2:number):{sx:number;sy:number;ex:number;ey:number}=>{
      if(x1===x2) return{sx:x1,sy:0,ex:x1,ey:H};
      const slope=(y2-y1)/(x2-x1);
      const yAtLeft=y1+slope*(0-x1);
      const yAtRight=y1+slope*(W-x1);
      return{sx:0,sy:yAtLeft,ex:W,ey:yAtRight};
    };

    const drawOne=(d:Drawing,isSel=false)=>{
      const col=d.color;
      ctx.strokeStyle=col; ctx.fillStyle=col;
      ctx.lineWidth=isSel?2.5:2; ctx.lineCap="round"; ctx.lineJoin="round";

      if(d.type==="trendline"&&d.pts.length>=2){
        const[a,b]=d.pts;
        const{sx,sy,ex,ey}=extendLine(a.x,a.y,b.x,b.y);
        ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke();
        // Draw endpoint handles
        [a,b].forEach(pt=>{
          ctx.beginPath();
          ctx.arc(pt.x,pt.y,isSel?6:4,0,Math.PI*2);
          ctx.fillStyle=isSel?"#fff":col;
          ctx.fill();
          ctx.strokeStyle=col; ctx.lineWidth=1.5;
          ctx.stroke();
        });
        // Selection glow
        if(isSel){
          ctx.strokeStyle=col+"50"; ctx.lineWidth=8;
          ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke();
          ctx.strokeStyle=col; ctx.lineWidth=2.5;
        }
      } else if(d.type==="line"&&d.pts.length>=2){
        ctx.beginPath(); ctx.moveTo(d.pts[0].x,d.pts[0].y);
        d.pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y)); ctx.stroke();
      } else if(d.type==="hline"&&d.pts.length>=1){
        ctx.setLineDash([8,5]);
        ctx.beginPath(); ctx.moveTo(0,d.pts[0].y); ctx.lineTo(W,d.pts[0].y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.font="bold 10px Inter"; ctx.textAlign="left";
        ctx.fillText(d.text||"",8,d.pts[0].y-5);
      } else if(d.type==="rect"&&d.pts.length>=2){
        const[a,b]=d.pts;
        ctx.globalAlpha=0.12; ctx.fillRect(a.x,a.y,b.x-a.x,b.y-a.y); ctx.globalAlpha=1;
        ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);
      } else if(d.type==="text"&&d.pts.length>=1){
        ctx.font="bold 13px Inter"; ctx.textAlign="left";
        ctx.fillText(d.text||"",d.pts[0].x,d.pts[0].y);
      }
    };

    drawings.forEach(d=>drawOne(d,d.id===selected));
    if(drawing) drawOne(drawing);

    // First-click ghost for trendline
    if(pendingPt&&tool==="trendline"){
      ctx.fillStyle="#00e5ff";
      ctx.beginPath(); ctx.arc(pendingPt.x,pendingPt.y,5,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle="rgba(0,229,255,0.4)"; ctx.lineWidth=1;
      ctx.setLineDash([4,3]);
      ctx.beginPath(); ctx.arc(pendingPt.x,pendingPt.y,12,0,Math.PI*2); ctx.stroke();
      ctx.setLineDash([]);
    }
  },[drawings,drawing,selected,pendingPt,tool]);

  // -- Overlay mouse handlers ------------------------------------------------
  const getPos=(e:React.MouseEvent<HTMLCanvasElement>)=>{
    const r=overlayRef.current!.getBoundingClientRect();
    return{x:e.clientX-r.left,y:e.clientY-r.top};
  };

  // Find drawing near a point (for selection/dragging)
  const findDrawing=(p:{x:number;y:number}):{id:string;ptIdx:number}|null=>{
    for(const d of [...drawings].reverse()){
      if(d.type==="trendline"&&d.pts.length>=2){
        // Check if near an endpoint (for dragging)
        for(let i=0;i<d.pts.length;i++){
          const pt=d.pts[i];
          if(Math.hypot(p.x-pt.x,p.y-pt.y)<10) return{id:d.id,ptIdx:i};
        }
        // Check if near the line itself
        const[a,b]=d.pts;
        const len=Math.hypot(b.x-a.x,b.y-a.y);
        if(len>0){
          const dist=Math.abs((b.y-a.y)*p.x-(b.x-a.x)*p.y+b.x*a.y-b.y*a.x)/len;
          if(dist<8) return{id:d.id,ptIdx:-1}; // -1 = whole line drag
        }
      }
    }
    return null;
  };

  const onDown=useCallback((e:React.MouseEvent<HTMLCanvasElement>)=>{
    const p=getPos(e);
    const id=Math.random().toString(36).slice(2);

    if(tool==="cursor"){
      // Try to select/start drag
      const hit=findDrawing(p);
      if(hit){
        setSelected(hit.id);
        setDragging({id:hit.id,ptIdx:hit.ptIdx,ox:p.x,oy:p.y});
      } else {
        setSelected(null);
      }
      return;
    }

    if(tool==="trendline"){
      if(!pendingPt){
        // First click: set anchor point
        setPendingPt(p);
      } else {
        // Second click: complete the line
        setDrawings(d=>[...d,{id,type:"trendline",pts:[pendingPt,p],color}]);
        setPendingPt(null);
        setSelected(id);
      }
      return;
    }

    if(tool==="text"){const t=prompt("Label:");if(t)setDrawings(d=>[...d,{id,type:"text",pts:[p],color,text:t}]);return;}
    setDrawing({id,type:tool,pts:[p],color});
  },[tool,color,pendingPt,drawings]);

  const onMove=useCallback((e:React.MouseEvent<HTMLCanvasElement>)=>{
    const p=getPos(e);

    // Drag selected drawing
    if(dragging){
      const dx=p.x-dragging.ox, dy=p.y-dragging.oy;
      setDrawings(ds=>ds.map(d=>{
        if(d.id!==dragging.id) return d;
        if(dragging.ptIdx===-1){
          // Move whole line
          return{...d,pts:d.pts.map(pt=>({x:pt.x+dx,y:pt.y+dy}))};
        } else {
          // Move single endpoint
          const pts=[...d.pts];
          pts[dragging.ptIdx]={x:p.x,y:p.y};
          return{...d,pts};
        }
      }));
      setDragging(prev=>prev?{...prev,ox:p.x,oy:p.y}:null);
      return;
    }

    if(!drawing) return;
    if(drawing.type==="line") setDrawing(d=>d?{...d,pts:[...d.pts,p]}:d);
    else setDrawing(d=>d?{...d,pts:[d.pts[0],p]}:d);
  },[drawing,dragging]);

  const onUp=useCallback(()=>{
    if(dragging){setDragging(null);return;}
    if(drawing){setDrawings(d=>[...d,drawing]);setDrawing(null);}
  },[drawing,dragging]);

  // Delete selected drawing with Delete/Backspace key
  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{
      if((e.key==="Delete"||e.key==="Backspace")&&selected&&document.activeElement?.tagName!=="INPUT"){
        setDrawings(d=>d.filter(x=>x.id!==selected));
        setSelected(null);
      }
      if(e.key==="Escape"){setPendingPt(null);}
    };
    window.addEventListener("keydown",handler);
    return()=>window.removeEventListener("keydown",handler);
  },[selected]);

  const reset=useCallback(()=>{setPlaying(false);setVisible(1);},[]);
  const togglePlay=useCallback(()=>{
    if(visible>=allCandles.length){reset();setTimeout(()=>setPlaying(true),50);}
    else setPlaying(p=>!p);
  },[visible,allCandles.length,reset]);

  const curT=allCandles[Math.min(visible-1,allCandles.length-1)]?.t;

  const TOOLS=[
    {id:"cursor"    as Tool,icon:"↖",tip:"Select / Move lines"},
    {id:"trendline" as Tool,icon:"╱",tip:"Trend Line — click two points, extends both ways"},
    {id:"hline"     as Tool,icon:"—",tip:"Horizontal line"},
    {id:"rect"      as Tool,icon:"⬜",tip:"Rectangle / Box"},
    {id:"line"      as Tool,icon:"✏",tip:"Free draw"},
    {id:"text"      as Tool,icon:"T",tip:"Text label"},
  ];
  const COLORS=["#00e5ff","#00e676","#ff1744","#ff6b35","#ffab00","#ffffff","#d500f9","#f9fafb"];

  return(
    <div onClick={e=>{if(e.target===e.currentTarget){ onSaveLevels?.(parseFloat(localSl)||null, parseFloat(localTp)||null); onClose(); }}} style={{
      position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.9)",
      backdropFilter:"blur(12px)",display:"flex",alignItems:"center",justifyContent:"center",padding:12,
    }}>
      <div style={{
        width:"100%",maxWidth:1060,height:"min(92vh,760px)",
        background:"linear-gradient(160deg,#0f1520,#0b1017)",
        border:"1px solid rgba(255,255,255,0.09)",borderRadius:20,overflow:"hidden",
        boxShadow:"0 0 120px rgba(0,0,0,0.95),0 0 1px rgba(0,229,255,0.15) inset",
        display:"flex",flexDirection:"column",
      }}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 18px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(0,0,0,0.35)",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap" as const}}>
            <span style={{fontSize:16,fontWeight:900,fontFamily:"monospace",color:"#f0f6fc",letterSpacing:"-0.03em"}}>{ticker}</span>
            <span style={{padding:"2px 8px",borderRadius:5,fontSize:10,fontWeight:700,background:side==="LONG"?"rgba(0,230,118,0.12)":"rgba(255,23,68,0.12)",color:side==="LONG"?"#00e676":"#ff1744"}}>{side}</span>
            <div style={{width:1,height:16,background:"rgba(255,255,255,0.07)"}}/>
            {([
              ["Entry","$"+fP(entryPrice),"#00e5ff"],
              ["Exit",exitPrice?"$"+fP(exitPrice):"Open","#ff6b35"],
              ["P&L",netPnl!=null?f$(netPnl):"—",isPos?"#00e676":"#ff1744"],
              ] as [string,string,string][]).map(([l,v,c])=>(
              <div key={l}>
                <div style={{fontSize:9,color:"#3d4551",textTransform:"uppercase" as const,letterSpacing:"0.07em",marginBottom:1}}>{l}</div>
                <div style={{fontSize:11,fontWeight:700,fontFamily:"monospace",color:c}}>{v}</div>
              </div>
            ))}
            <div style={{width:1,height:16,background:"rgba(255,255,255,0.07)"}}/>
            {/* Editable SL/TP inputs */}
            <div>
              <div style={{fontSize:9,color:"#ff1744",textTransform:"uppercase" as const,letterSpacing:"0.07em",marginBottom:1}}>SL</div>
              <input type="number" value={localSl} onChange={e=>setLocalSl(e.target.value)} placeholder="price"
                style={{width:72,height:20,background:"rgba(255,23,68,0.1)",border:"1px solid rgba(255,23,68,0.25)",borderRadius:4,color:"#ff1744",fontSize:10,fontFamily:"monospace",fontWeight:700,padding:"0 5px",outline:"none"}}/>
            </div>
            <div>
              <div style={{fontSize:9,color:"#00e676",textTransform:"uppercase" as const,letterSpacing:"0.07em",marginBottom:1}}>TP</div>
              <input type="number" value={localTp} onChange={e=>setLocalTp(e.target.value)} placeholder="price"
                style={{width:72,height:20,background:"rgba(0,230,118,0.1)",border:"1px solid rgba(0,230,118,0.25)",borderRadius:4,color:"#00e676",fontSize:10,fontFamily:"monospace",fontWeight:700,padding:"0 5px",outline:"none"}}/>
            </div>
          </div>
          <button onClick={()=>{ onSaveLevels?.(parseFloat(localSl)||null, parseFloat(localTp)||null); onClose(); }} style={{width:28,height:28,borderRadius:8,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",color:"#4b5563",cursor:"pointer",fontSize:17,display:"flex",alignItems:"center",justifyContent:"center"}}
            onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.background="rgba(255,255,255,0.1)";el.style.color="#c9d1d9";}}
            onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.background="rgba(255,255,255,0.05)";el.style.color="#4b5563";}}>×</button>
        </div>

        {/* Body: sidebar + chart */}
        <div style={{flex:1,display:"flex",minHeight:0}}>

          {/* Left toolbar */}
          <div style={{width:46,display:"flex",flexDirection:"column" as const,alignItems:"center",gap:4,padding:"10px 0",borderRight:"1px solid rgba(255,255,255,0.06)",background:"rgba(0,0,0,0.3)",flexShrink:0}}>
            <div style={{fontSize:8,color:"#3d4551",textTransform:"uppercase" as const,letterSpacing:"0.06em",marginBottom:2}}>Draw</div>
            {TOOLS.map(t=>(
              <button key={t.id} onClick={()=>setTool(t.id)} title={t.tip} style={{
                width:34,height:34,borderRadius:8,border:"1px solid",
                borderColor:tool===t.id?"rgba(0,229,255,0.5)":"rgba(255,255,255,0.07)",
                background:tool===t.id?"rgba(0,229,255,0.14)":"rgba(255,255,255,0.03)",
                color:tool===t.id?"#00e5ff":"#6b7280",
                cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",
                transition:"all 0.12s",boxShadow:tool===t.id?"0 0 8px rgba(0,229,255,0.2)":"none",
              }}>{t.icon}</button>
            ))}
            <div style={{width:28,height:1,background:"rgba(255,255,255,0.07)",margin:"6px 0"}}/>
            <div style={{fontSize:8,color:"#3d4551",textTransform:"uppercase" as const,letterSpacing:"0.06em",marginBottom:2}}>Color</div>
            {COLORS.map(c=>(
              <button key={c} onClick={()=>setColor(c)} title={c} style={{
                width:20,height:20,borderRadius:"50%",border:`2px solid ${color===c?"#fff":"rgba(255,255,255,0.12)"}`,
                background:c,cursor:"pointer",transition:"transform 0.1s, border 0.1s",
                transform:color===c?"scale(1.25)":"scale(1)",
              }}/>
            ))}
            <div style={{width:28,height:1,background:"rgba(255,255,255,0.07)",margin:"6px 0"}}/>
            <button onClick={()=>{setDrawings(d=>d.slice(0,-1));setSelected(null);setPendingPt(null);}} title="Undo last drawing" style={{width:34,height:34,borderRadius:8,border:"1px solid rgba(255,255,255,0.07)",background:"rgba(255,255,255,0.03)",color:"#6b7280",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>↩</button>
            <button onClick={()=>{setDrawings([]);setSelected(null);setPendingPt(null);}} title="Clear all drawings" style={{width:34,height:34,borderRadius:8,border:"1px solid rgba(255,255,255,0.07)",background:"rgba(255,255,255,0.03)",color:"#6b7280",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>🗑</button>
          </div>

          {/* Chart */}
          <div style={{flex:1,position:"relative",minWidth:0,background:"#060a0f"}}>
            <div ref={containerRef} style={{position:"absolute",inset:0}}/>
            <canvas ref={overlayRef}
              onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
              style={{
                position:"absolute",inset:0,width:"100%",height:"100%",
                cursor:tool==="cursor"?(dragging?"grabbing":"default"):tool==="text"?"text":tool==="trendline"?"crosshair":"crosshair",
                pointerEvents:tool==="cursor"?"none":"auto",zIndex:10,
              }}
            />
            {status==="loading"&&(
              <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column" as const,alignItems:"center",justifyContent:"center",gap:12,background:"rgba(6,10,15,0.97)",zIndex:20}}>
                <div style={{width:36,height:36,borderRadius:"50%",border:"2px solid rgba(0,229,255,0.15)",borderTop:"2px solid #00e5ff",animation:"spin 0.8s linear infinite"}}/>
                <span style={{fontSize:13,color:"#4b5563"}}>Fetching 1-min data for {toYahoo(ticker)}...</span>
                <span style={{fontSize:11,color:"#374151"}}>Trying multiple sources...</span>
              </div>
            )}
            {status==="error"&&(
              <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column" as const,alignItems:"center",justifyContent:"center",gap:10,background:"rgba(6,10,15,0.97)",zIndex:20,padding:32}}>
                <span style={{fontSize:26}}>📡</span>
                <span style={{fontSize:14,fontWeight:700,color:"#ff1744"}}>Price data unavailable</span>
                <span style={{fontSize:12,color:"#4b5563",textAlign:"center" as const,maxWidth:400,lineHeight:1.8}}>
                  {errMsg}<br/>Yahoo Finance 1-min data is limited to the last 30 days and market hours.
                </span>
                <button onClick={()=>{setStatus("loading");setAllCandles([]);}} style={{marginTop:8,height:30,padding:"0 16px",borderRadius:8,background:"rgba(0,229,255,0.1)",border:"1px solid rgba(0,229,255,0.25)",color:"#00e5ff",fontSize:12,fontWeight:700,cursor:"pointer"}}>Retry</button>
              </div>
            )}
            {status==="ok"&&tool!=="cursor"&&(
              <div style={{position:"absolute",bottom:8,left:"50%",transform:"translateX(-50%)",background:"rgba(0,0,0,0.8)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:20,padding:"4px 14px",fontSize:10,color:"#6b7280",pointerEvents:"none",zIndex:11,whiteSpace:"nowrap" as const}}>
                {tool==="trendline"
                  ? (pendingPt ? "✓ First point set — click second point to complete the line" : "Click to set first point of trend line")
                  : tool==="line"?"Click and drag to draw freely"
                  : tool==="hline"?"Click to place a horizontal line"
                  : tool==="rect"?"Click and drag to draw a box"
                  : "Click to place text"}
                {tool!=="trendline"&&" · Switch to ↖ to select / move drawings"}
                {selected&&" · Press Delete to remove selected line"}
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div style={{display:"flex",alignItems:"center",gap:12,padding:"11px 18px",borderTop:"1px solid rgba(255,255,255,0.06)",background:"rgba(0,0,0,0.35)",flexShrink:0,flexWrap:"wrap" as const}}>
          <button onClick={togglePlay} disabled={status!=="ok"} style={{
            width:40,height:40,borderRadius:12,border:"1px solid rgba(0,229,255,0.3)",
            background:playing?"rgba(0,229,255,0.2)":"rgba(0,229,255,0.08)",
            color:"#00e5ff",cursor:status==="ok"?"pointer":"default",fontSize:18,
            display:"flex",alignItems:"center",justifyContent:"center",
            boxShadow:playing?"0 0 16px rgba(0,229,255,0.3)":"none",
            transition:"all 0.15s",opacity:status==="ok"?1:0.4,flexShrink:0,
          }}>{playing?"⏸":"▶"}</button>

          <button onClick={reset} disabled={status!=="ok"} style={{
            width:40,height:40,borderRadius:12,border:"1px solid rgba(255,255,255,0.09)",
            background:"rgba(255,255,255,0.04)",color:"#6b7280",
            cursor:status==="ok"?"pointer":"default",fontSize:16,
            display:"flex",alignItems:"center",justifyContent:"center",
            opacity:status==="ok"?1:0.4,flexShrink:0,
          }}>⏮</button>

          <div style={{flex:1,display:"flex",flexDirection:"column" as const,gap:5,minWidth:120}}>
            <input type="range" min={1} max={Math.max(1,allCandles.length)} value={visible}
              onChange={e=>{setPlaying(false);setVisible(+e.target.value);}}
              disabled={status!=="ok"}
              style={{width:"100%",accentColor:"#00e5ff",cursor:status==="ok"?"pointer":"default",height:4}}
            />
            <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#374151",fontFamily:"monospace"}}>
              {allCandles.length?<>
                <span>{fT(allCandles[0].t)} (-{BARS_PAD})</span>
                <span style={{color:"#00e5ff"}}>{curT?fDT(curT):"—"} · {visible}/{allCandles.length}</span>
                <span>+{BARS_PAD} {fT(allCandles[allCandles.length-1].t)}</span>
              </>:<span style={{margin:"0 auto"}}>—</span>}
            </div>
          </div>

          <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            <span style={{fontSize:10,color:"#3d4551",textTransform:"uppercase" as const,letterSpacing:"0.06em"}}>Speed</span>
            {[1,2,4,8,16].map(s=>(
              <button key={s} onClick={()=>setSpeed(s)} style={{
                height:30,padding:"0 10px",borderRadius:8,border:"1px solid",
                borderColor:speed===s?"rgba(0,229,255,0.45)":"rgba(255,255,255,0.08)",
                background:speed===s?"rgba(0,229,255,0.12)":"rgba(255,255,255,0.03)",
                color:speed===s?"#00e5ff":"#4b5563",
                fontSize:11,fontWeight:700,cursor:"pointer",transition:"all 0.12s",
              }}>{s}×</button>
            ))}
            {/* Color picker */}
            <div style={{position:"relative" as const}}>
              <button onClick={()=>setShowColorPicker(p=>!p)} style={{height:30,padding:"0 10px",borderRadius:8,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.03)",color:"#4b5563",cursor:"pointer",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",gap:5}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:chartColors.up,display:"inline-block"}}/>
                <span style={{width:8,height:8,borderRadius:"50%",background:chartColors.down,display:"inline-block"}}/>
                Theme
              </button>
              {showColorPicker&&(
                <div style={{position:"absolute",bottom:36,right:0,zIndex:9999,background:"#0f1520",border:"1px solid rgba(255,255,255,0.12)",borderRadius:12,padding:12,display:"flex",flexDirection:"column",gap:8,minWidth:170}}>
                  {([["Bull",chartColors.up,"up"],["Bear",chartColors.down,"down"],["BG",chartColors.bg,"bg"]] as const).map(([lbl,val,key])=>(
                    <div key={key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                      <span style={{fontSize:11,color:"#8b949e"}}>{lbl}</span>
                      <input type="color" value={val} onChange={e=>setChartColors(c=>({...c,[key]:e.target.value}))} style={{width:28,height:22,borderRadius:5,border:"none",cursor:"pointer"}}/>
                    </div>
                  ))}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,marginTop:4}}>
                    {[["Classic","#00e676","#ff1744","#060a0f"],["TV Dark","#26a69a","#ef5350","#131722"],["Mono","#ffffff","#888888","#1a1a1a"],["Light","#089981","#f23645","#f0f3fa"]].map(([n,u,d,b])=>(
                      <button key={n} onClick={()=>setChartColors({up:u,down:d,bg:b})} style={{height:24,borderRadius:6,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.03)",color:"#8b949e",cursor:"pointer",fontSize:10}}>{n}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// -- Icon + exported button -----------------------------------------------------
function CandleIcon({color="#00e5ff"}:{color?:string}) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <line x1="4" y1="1" x2="4" y2="3" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
      <rect x="2.5" y="3" width="3" height="6" rx="0.6" fill={color} fillOpacity="0.9"/>
      <line x1="4" y1="9" x2="4" y2="13" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="10" y1="2" x2="10" y2="5" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
      <rect x="8.5" y="5" width="3" height="5" rx="0.6" fill={color} fillOpacity="0.9"/>
      <line x1="10" y1="10" x2="10" y2="12" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

export function CandleChartBtn({trade,size=28}:{trade:Record<string,any>;size?:number}) {
  const [open,setOpen]=useState(false);
  const [showUpgrade,setShowUpgrade]=useState(false);
  const { isPro, status } = useSubscription();
  const { updateTrade } = useStore();
  const { activeAccountId, updateAccountTrade, getActiveTrades } = useAccountStore();
  const handleSaveLevels=(sl:number|null,tp:number|null)=>{
    if(!trade.id) return;
    // Try account store first (most trades live here), fallback to main store
    const inAccount = getActiveTrades().some((t:any)=>t.id===trade.id);
    if(inAccount && activeAccountId){
      updateAccountTrade(activeAccountId, trade.id, {stopLoss:sl, takeProfit:tp});
    } else {
      updateTrade(trade.id, {stopLoss:sl, takeProfit:tp});
    }
  };
  return (
    <>
      <button onClick={e=>{e.stopPropagation(); if(status==="loading") return; if(isPro) setOpen(true); else setShowUpgrade(true);}} title="Replay trade chart"
        style={{width:size,height:size,borderRadius:7,background:"rgba(0,229,255,0.06)",border:"1px solid rgba(0,229,255,0.18)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,transition:"all 0.12s"}}
        onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.background="rgba(0,229,255,0.16)";el.style.borderColor="rgba(0,229,255,0.45)";el.style.boxShadow="0 0 12px rgba(0,229,255,0.25)";}}
        onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.background="rgba(0,229,255,0.06)";el.style.borderColor="rgba(0,229,255,0.18)";el.style.boxShadow="none";}}
      ><CandleIcon/></button>
      {showUpgrade&&<PricingModal onClose={()=>setShowUpgrade(false)}/>}
      {open&&(
        <TradeReplayPopup
          ticker={String(trade.ticker||"")}
          entryTime={String(trade.entryTime||"")}
          exitTime={trade.exitTime as string|null}
          side={String(trade.side||"LONG")}
          entryPrice={Number(trade.entryPrice||0)}
          exitPrice={trade.exitPrice as number|null}
          stopLoss={trade.stopLoss as number|null}
          takeProfit={trade.takeProfit as number|null}
          netPnl={trade.netPnl as number|null}
          onClose={()=>setOpen(false)}
          onSaveLevels={handleSaveLevels}
        />
      )}
    </>
  );
}
