"use client";
import { useMemo } from "react";
import { useAccountStore } from "@/store/accounts";
import { calculateMetrics } from "@/lib/calculations";
import { Trade } from "@/types/trade";
import { fmt$, fmtN } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, ScatterChart, Scatter, ZAxis, ReferenceLine } from "recharts";

const TTP = {
  contentStyle:{ background:"#111318", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, fontSize:11, padding:"8px 12px" },
  labelStyle:{ color:"#6b7280" }, itemStyle:{ color:"#d1d5db" },
};

function Panel({ children, title, sub, p=18 }: { children:React.ReactNode; title?:string; sub?:string; p?:number }) {
  return (
    <div style={{ background:"#0e1117", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12, padding:p }}>
      {title && <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.08em", color:"#4b5563" }}>{title}</div>
        {sub && <div style={{ fontSize:10, color:"#374151", marginTop:2 }}>{sub}</div>}
      </div>}
      {children}
    </div>
  );
}

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const HOURS = Array.from({length:24},(_,i)=>i);

export default function AdvancedAnalyticsPage() {
  const { getActiveTrades } = useAccountStore();
  const trades = getActiveTrades();
  const closed = useMemo(()=>trades.filter(t=>t.status==="CLOSED"&&t.netPnl!==null) as Trade[],[trades]);
  const M = useMemo(()=>calculateMetrics(closed),[closed]);

  // -- Time of day heatmap (hour - day) --------------------------------------
  const heatmap = useMemo(()=>{
    const m: Record<string, {pnl:number;count:number}> = {};
    for(const t of closed){
      const d = new Date(t.entryTime);
      const key = `${d.getDay()}-${d.getHours()}`;
      if(!m[key]) m[key]={pnl:0,count:0};
      m[key].pnl += t.netPnl!;
      m[key].count++;
    }
    return m;
  },[closed]);

  const maxAbsHeat = useMemo(()=>Math.max(...Object.values(heatmap).map(v=>Math.abs(v.pnl)),1),[heatmap]);

  // -- Best/worst tickers ----------------------------------------------------
  const byTicker = useMemo(()=>{
    const m: Record<string,{pnl:number;count:number;wins:number}> = {};
    for(const t of closed){
      const k = t.ticker.replace(/\d+!$/,"").replace(/!$/,"");
      if(!m[k]) m[k]={pnl:0,count:0,wins:0};
      m[k].pnl += t.netPnl!; m[k].count++;
      if(t.netPnl!>0) m[k].wins++;
    }
    return Object.entries(m).map(([ticker,v])=>({ticker,...v,wr:+(v.wins/v.count*100).toFixed(0)})).sort((a,b)=>b.pnl-a.pnl);
  },[closed]);

  // -- Slippage data ---------------------------------------------------------
  const slippageData = useMemo(()=>
    closed.filter(t=>t.expectedEntry&&t.expectedEntry>0).map(t=>({
      ticker:t.ticker,
      slippage:Math.abs(t.entryPrice-(t.expectedEntry||t.entryPrice)),
      pnl:t.netPnl||0,
      entryPrice:t.entryPrice,
      expectedEntry:t.expectedEntry||t.entryPrice,
    }))
  ,[closed]);

  // -- Tag performance -------------------------------------------------------
  const byTag = useMemo(()=>{
    const m: Record<string,{pnl:number;count:number;wins:number}> = {};
    for(const t of closed){
      for(const tag of (t.tags||[])){
        if(!m[tag]) m[tag]={pnl:0,count:0,wins:0};
        m[tag].pnl+=t.netPnl!; m[tag].count++;
        if(t.netPnl!>0) m[tag].wins++;
      }
    }
    return Object.entries(m).map(([tag,v])=>({tag,...v,wr:+(v.wins/v.count*100).toFixed(0)})).sort((a,b)=>b.pnl-a.pnl);
  },[closed]);

  if(!closed.length) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#374151",flexDirection:"column" as const,gap:12}}>
      <div style={{fontSize:36}}>📊</div><div>Import trades to see advanced analytics</div>
    </div>
  );

  const heatColor = (pnl:number) => {
    const i = Math.min(Math.abs(pnl)/maxAbsHeat,1);
    if(pnl>0) return `rgba(0,230,118,${0.08+i*0.7})`;
    if(pnl<0) return `rgba(255,23,68,${0.08+i*0.7})`;
    return "rgba(255,255,255,0.025)";
  };

  return (
    <div style={{padding:20,overflowY:"auto",height:"100%",display:"flex",flexDirection:"column",gap:14}}>

      {/* -- Time of Day Heatmap -- */}
      <Panel title="P&L by Hour & Day of Week" sub="Darker = larger magnitude · Green = profit · Red = loss" p={18}>
        <div style={{overflowX:"auto"}}>
          <div style={{display:"grid",gridTemplateColumns:`60px repeat(${HOURS.length},1fr)`,gap:3,minWidth:700}}>
            {/* Header row */}
            <div/>
            {HOURS.map(h=>(
              <div key={h} style={{textAlign:"center" as const,fontSize:9,color:"#374151",padding:"0 0 4px"}}>
                {h===0?"12a":h<12?`${h}a`:h===12?"12p":`${h-12}p`}
              </div>
            ))}
            {/* Day rows */}
            {DAYS.map((day,di)=>[
              <div key={"label-"+day} style={{fontSize:10,color:"#4b5563",display:"flex",alignItems:"center",paddingRight:8}}>{day}</div>,
              ...HOURS.map(h=>{
                const k=`${di}-${h}`;
                const d=heatmap[k];
                return (
                  <div key={h} title={d?`${day} ${h}:00 — ${fmt$(d.pnl)} · ${d.count} trades`:`${day} ${h}:00`} style={{
                    height:28,borderRadius:4,
                    background:d?heatColor(d.pnl):"rgba(255,255,255,0.025)",
                    border:"1px solid rgba(255,255,255,0.04)",
                    cursor:d?"default":"default",
                    transition:"transform 0.1s",
                    display:"flex",alignItems:"center",justifyContent:"center",
                  }}
                  onMouseEnter={e=>(e.currentTarget as HTMLElement).style.transform="scale(1.15)"}
                  onMouseLeave={e=>(e.currentTarget as HTMLElement).style.transform="scale(1)"}
                  >
                    {d&&d.count>0&&<span style={{fontSize:8,color:"rgba(255,255,255,0.5)",fontWeight:700}}>{d.count}</span>}
                  </div>
                );
              })
            ]).flat()}
          </div>
        </div>
        <div style={{display:"flex",gap:16,marginTop:10,fontSize:10,color:"#374151"}}>
          <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:12,height:12,borderRadius:2,background:"rgba(0,230,118,0.5)"}}/>Profit</div>
          <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:12,height:12,borderRadius:2,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)"}}/>No trades</div>
          <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:12,height:12,borderRadius:2,background:"rgba(255,23,68,0.5)"}}/>Loss</div>
          <div style={{marginLeft:8}}>Numbers show trade count per cell</div>
        </div>
      </Panel>

      {/* -- Best/Worst Tickers -- */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <Panel title="Best Performing Symbols" sub="By net P&L">
          {byTicker.slice(0,8).map((r,i)=>(
            <div key={r.ticker} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
              <span style={{fontSize:11,color:"#374151",width:16,textAlign:"right" as const,flexShrink:0}}>#{i+1}</span>
              <span style={{fontWeight:800,fontSize:13,fontFamily:"monospace",color:"#f0f6fc",width:60}}>{r.ticker.replace(/\d+!$/,"")}</span>
              <div style={{flex:1,height:4,borderRadius:2,background:"rgba(255,255,255,0.04)",overflow:"hidden"}}>
                <div style={{height:"100%",width:`${Math.min(Math.abs(r.pnl)/Math.max(...byTicker.map(x=>Math.abs(x.pnl)),1)*100,100)}%`,background:r.pnl>=0?"#00e676":"#ff1744",borderRadius:2}}/>
              </div>
              <span style={{fontSize:12,fontFamily:"monospace",fontWeight:800,color:r.pnl>=0?"#00e676":"#ff1744",width:90,textAlign:"right" as const}}>{fmt$(r.pnl)}</span>
              <span style={{fontSize:10,color:"#4b5563",width:40,textAlign:"right" as const}}>{r.wr}%</span>
              <span style={{fontSize:10,color:"#374151",width:30,textAlign:"right" as const}}>{r.count}t</span>
            </div>
          ))}
          {byTicker.length===0&&<div style={{fontSize:12,color:"#374151",padding:"20px 0",textAlign:"center" as const}}>No trades</div>}
        </Panel>

        <Panel title="Setup Tag Performance" sub="P&L by strategy tag">
          {byTag.length===0
            ?<div style={{fontSize:12,color:"#374151",padding:"20px 0",textAlign:"center" as const}}>Tag your trades to see performance by setup</div>
            :byTag.slice(0,8).map((r,i)=>(
              <div key={r.tag} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                <span style={{fontSize:11,color:"#374151",width:16,textAlign:"right" as const,flexShrink:0}}>#{i+1}</span>
                <span style={{fontWeight:600,fontSize:12,color:"#c9d1d9",flex:1}}>{r.tag}</span>
                <span style={{fontSize:12,fontFamily:"monospace",fontWeight:800,color:r.pnl>=0?"#00e676":"#ff1744",width:90,textAlign:"right" as const}}>{fmt$(r.pnl)}</span>
                <span style={{fontSize:10,color:"#4b5563",width:40,textAlign:"right" as const}}>{r.wr}%</span>
                <span style={{fontSize:10,color:"#374151",width:30,textAlign:"right" as const}}>{r.count}t</span>
              </div>
            ))
          }
        </Panel>
      </div>

      {/* -- Slippage Tracker -- */}
      <Panel title="Slippage Tracker" sub="Difference between expected and actual fill price">
        {slippageData.length===0
          ?(
            <div style={{textAlign:"center" as const,padding:"24px 0",color:"#374151"}}>
              <div style={{fontSize:13,marginBottom:6}}>No slippage data yet</div>
              <div style={{fontSize:11}}>Set an &quot;Expected Entry&quot; price in the trade detail panel (click any trade) to track slippage</div>
            </div>
          ):(
            <div>
              <div style={{display:"flex",gap:20,marginBottom:14}}>
                <div><div style={{fontSize:9,color:"#4b5563",textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:3}}>Avg Slippage</div><div style={{fontSize:18,fontWeight:800,fontFamily:"monospace",color:"#ffab00"}}>{M.avgSlippage.toFixed(4)} pts</div></div>
                <div><div style={{fontSize:9,color:"#4b5563",textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:3}}>Trades Tracked</div><div style={{fontSize:18,fontWeight:800,fontFamily:"monospace",color:"#c9d1d9"}}>{slippageData.length}</div></div>
                <div><div style={{fontSize:9,color:"#4b5563",textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:3}}>Max Slippage</div><div style={{fontSize:18,fontWeight:800,fontFamily:"monospace",color:"#ff1744"}}>{slippageData.length?Math.max(...slippageData.map(d=>d.slippage)).toFixed(4):0} pts</div></div>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={slippageData.slice(0,20)} margin={{top:4,right:4,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.03)" vertical={false}/>
                  <XAxis dataKey="ticker" tick={{fontSize:9,fill:"#374151"}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fontSize:9,fill:"#374151"}} axisLine={false} tickLine={false} width={40}/>
                  <Tooltip {...TTP} formatter={(v:any)=>[+v.toFixed(4)+" pts","Slippage"] as any}/>
                  <Bar dataKey="slippage" radius={[3,3,0,0]} maxBarSize={28}>
                    {slippageData.slice(0,20).map((_,i)=><Cell key={i} fill="#ffab00" fillOpacity={0.75}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
        }
      </Panel>

      {/* -- Breakeven Win Rate -- */}
      <Panel title="Breakeven Win Rate" sub="What win rate you need to be profitable given your avg win/loss">
        {(() => {
          const beWR = M.avgLoss > 0 ? M.avgLoss / (M.avgWin + M.avgLoss) * 100 : 0;
          const actual = M.winRate * 100;
          const edge = actual - beWR;
          return (
            <div style={{display:"flex",gap:24,flexWrap:"wrap" as const}}>
              <div>
                <div style={{fontSize:9,color:"#4b5563",textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:4}}>Breakeven W/R</div>
                <div style={{fontSize:32,fontWeight:900,fontFamily:"monospace",color:"#ffab00"}}>{beWR.toFixed(1)}%</div>
                <div style={{fontSize:11,color:"#4b5563",marginTop:3}}>Need this win rate to break even</div>
              </div>
              <div>
                <div style={{fontSize:9,color:"#4b5563",textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:4}}>Your Actual W/R</div>
                <div style={{fontSize:32,fontWeight:900,fontFamily:"monospace",color:actual>=beWR?"#00e676":"#ff1744"}}>{actual.toFixed(1)}%</div>
              </div>
              <div>
                <div style={{fontSize:9,color:"#4b5563",textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:4}}>Edge</div>
                <div style={{fontSize:32,fontWeight:900,fontFamily:"monospace",color:edge>=0?"#00e676":"#ff1744"}}>{edge>=0?"+":""}{edge.toFixed(1)}%</div>
                <div style={{fontSize:11,color:"#4b5563",marginTop:3}}>{edge>=0?"You have a positive edge":"You need to improve"}</div>
              </div>
              <div style={{flex:1,minWidth:200}}>
                <div style={{fontSize:9,color:"#4b5563",textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:8}}>Visual</div>
                <div style={{height:8,borderRadius:4,background:"rgba(255,255,255,0.05)",overflow:"hidden",marginBottom:6}}>
                  <div style={{height:"100%",width:`${Math.min(beWR,100)}%`,background:"rgba(255,171,0,0.6)",borderRadius:4,position:"relative" as const}}>
                    <div style={{position:"absolute" as const,right:0,top:-2,width:2,height:12,background:"#ffab00"}}/>
                  </div>
                </div>
                <div style={{height:8,borderRadius:4,background:"rgba(255,255,255,0.05)",overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.min(actual,100)}%`,background:actual>=beWR?"#00e676":"#ff1744",borderRadius:4}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#374151",marginTop:4}}>
                  <span>0%</span><span>50%</span><span>100%</span>
                </div>
              </div>
            </div>
          );
        })()}
      </Panel>

      {/* -- Commission Impact -- */}
      <Panel title="Commission Impact" sub="How much fees are costing you over time">
        {(() => {
          const totalComm = closed.reduce((a,t)=>a+(t.commissions||0)+(t.fees||0),0);
          const totalGross = closed.reduce((a,t)=>a+(t.grossPnl||0),0);
          const totalNet = closed.reduce((a,t)=>a+(t.netPnl||0),0);
          const commPct = totalGross!==0 ? Math.abs(totalComm/totalGross*100) : 0;
          const perTrade = closed.length ? totalComm/closed.length : 0;

          // Commission by month
          const byMonth: Record<string,{gross:number;comm:number}> = {};
          for(const t of closed){
            const k=t.entryTime.slice(0,7);
            if(!byMonth[k]) byMonth[k]={gross:0,comm:0};
            byMonth[k].gross+=(t.grossPnl||0);
            byMonth[k].comm+=(t.commissions||0)+(t.fees||0);
          }
          const monthData=Object.entries(byMonth).sort(([a],[b])=>a.localeCompare(b)).slice(-12).map(([m,v])=>({month:m.slice(5),gross:+v.gross.toFixed(2),comm:+v.comm.toFixed(2),net:+(v.gross-v.comm).toFixed(2)}));

          return (
            <div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
                {[
                  ["Total Commissions",`-$${Math.abs(totalComm).toFixed(2)}`,"#ff1744"],
                  ["Gross P&L",`$${totalGross.toFixed(2)}`,totalGross>=0?"#00e676":"#ff1744"],
                  ["Net P&L",`$${totalNet.toFixed(2)}`,totalNet>=0?"#00e676":"#ff1744"],
                  ["Fees as % of Gross",`${commPct.toFixed(1)}%`,commPct>10?"#ff1744":commPct>5?"#ffab00":"#00e676"],
                  ["Per Trade Avg",`-$${Math.abs(perTrade).toFixed(2)}`,"#ffab00"],
                ].map(([l,v,col])=>(
                  <div key={l as string} style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"12px 14px"}}>
                    <div style={{fontSize:9,color:"#4b5563",textTransform:"uppercase" as const,letterSpacing:"0.07em",marginBottom:4}}>{l}</div>
                    <div style={{fontSize:16,fontWeight:800,fontFamily:"monospace",color:col as string}}>{v}</div>
                  </div>
                ))}
              </div>
              {monthData.length>0&&(
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={monthData} margin={{top:4,right:4,left:0,bottom:0}}>
                    <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.03)" vertical={false}/>
                    <XAxis dataKey="month" tick={{fontSize:9,fill:"#374151"}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:9,fill:"#374151"}} axisLine={false} tickLine={false} width={40}/>
                    <Tooltip {...TTP} formatter={(v:any,n:any)=>[`$${(+v).toFixed(2)}`,n] as any}/>
                    <Bar dataKey="gross" name="Gross" fill="rgba(0,229,255,0.3)" radius={[3,3,0,0]} maxBarSize={20}/>
                    <Bar dataKey="comm" name="Fees" fill="rgba(255,23,68,0.6)" radius={[3,3,0,0]} maxBarSize={20}/>
                    <Bar dataKey="net" name="Net" fill="#00e676" fillOpacity={0.8} radius={[3,3,0,0]} maxBarSize={20}/>
                  </BarChart>
                </ResponsiveContainer>
              )}
              {totalComm===0&&<div style={{textAlign:"center" as const,padding:"20px 0",fontSize:12,color:"#374151"}}>No commission data — your trades don't have commission/fee fields set</div>}
            </div>
          );
        })()}
      </Panel>

      {/* -- MAE/MFE Tracker -- */}
      <Panel title="MAE / MFE Analysis" sub="Max Adverse Excursion · Max Favorable Excursion — how far trades moved before close">
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"#ff1744",textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:10}}>MAE — Max Adverse Excursion</div>
            <div style={{fontSize:11,color:"#4b5563",lineHeight:1.7,marginBottom:12}}>
              How far against you a trade went before you closed it. High MAE on winners means you&apos;re holding through big drawdowns. High MAE on losers means you&apos;re stopping out late.
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[
                ["Avg MAE (Winners)","Track with expected entry","#00e676"],
                ["Avg MAE (Losers)","Track with expected entry","#ff1744"],
              ].map(([l,v,c])=>(
                <div key={l as string} style={{background:"rgba(255,255,255,0.03)",borderRadius:8,padding:"10px 12px"}}>
                  <div style={{fontSize:9,color:"#4b5563",textTransform:"uppercase" as const,letterSpacing:"0.07em",marginBottom:3}}>{l}</div>
                  <div style={{fontSize:12,fontWeight:700,color:c as string,fontFamily:"monospace"}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"#00e676",textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:10}}>MFE — Max Favorable Excursion</div>
            <div style={{fontSize:11,color:"#4b5563",lineHeight:1.7,marginBottom:12}}>
              How far in your favor a trade went before you closed it. If MFE is much larger than your actual exit, you&apos;re leaving money on the table by exiting too early.
            </div>
            <div style={{background:"rgba(255,255,255,0.03)",borderRadius:8,padding:"12px",fontSize:11,color:"#4b5563",lineHeight:1.7}}>
              💡 To track MAE/MFE accurately, set your <strong style={{color:"#c9d1d9"}}>Expected Entry</strong> price on each trade in the trade detail panel. Future versions will pull live tick data automatically.
            </div>
          </div>
        </div>
        {/* P&L scatter showing slippage as proxy for MAE */}
        {slippageData.length>0&&(
          <div style={{marginTop:16}}>
            <div style={{fontSize:10,color:"#4b5563",marginBottom:8}}>Entry slippage vs P&L (available data)</div>
            <ResponsiveContainer width="100%" height={160}>
              <ScatterChart margin={{top:4,right:4,left:0,bottom:0}}>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.03)"/>
                <XAxis dataKey="slippage" name="Slippage" tick={{fontSize:9,fill:"#374151"}} axisLine={false} tickLine={false} label={{value:"Slippage (pts)",position:"insideBottom",fill:"#374151",fontSize:9,dy:8}}/>
                <YAxis dataKey="pnl" name="P&L" tick={{fontSize:9,fill:"#374151"}} axisLine={false} tickLine={false} width={48} tickFormatter={v=>"$"+v.toFixed(0)}/>
                <ZAxis range={[30,30]}/>
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)"/>
                <Tooltip {...TTP} formatter={(v:any,n:any)=>[n==="P&L"?"$"+Number(v).toFixed(2):Number(v).toFixed(4),n] as any}/>
                <Scatter data={slippageData} fill="#00e5ff" fillOpacity={0.7}/>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel title="Breakeven Win Rate" sub="What win rate you need to be profitable given your avg win/loss">
        {(() => {
          const beWR = M.avgLoss > 0 ? M.avgLoss / (M.avgWin + M.avgLoss) * 100 : 0;
          const actual = M.winRate * 100;
          const edge = actual - beWR;
          return (
            <div style={{display:"flex",gap:24,flexWrap:"wrap" as const}}>
              <div>
                <div style={{fontSize:9,color:"#4b5563",textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:4}}>Breakeven W/R</div>
                <div style={{fontSize:32,fontWeight:900,fontFamily:"monospace",color:"#ffab00"}}>{beWR.toFixed(1)}%</div>
                <div style={{fontSize:11,color:"#4b5563",marginTop:3}}>Need this win rate to break even</div>
              </div>
              <div>
                <div style={{fontSize:9,color:"#4b5563",textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:4}}>Your Actual W/R</div>
                <div style={{fontSize:32,fontWeight:900,fontFamily:"monospace",color:actual>=beWR?"#00e676":"#ff1744"}}>{actual.toFixed(1)}%</div>
              </div>
              <div>
                <div style={{fontSize:9,color:"#4b5563",textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:4}}>Edge</div>
                <div style={{fontSize:32,fontWeight:900,fontFamily:"monospace",color:edge>=0?"#00e676":"#ff1744"}}>{edge>=0?"+":""}{edge.toFixed(1)}%</div>
                <div style={{fontSize:11,color:"#4b5563",marginTop:3}}>{edge>=0?"You have a positive edge":"You need to improve"}</div>
              </div>
              <div style={{flex:1,minWidth:200}}>
                <div style={{fontSize:9,color:"#4b5563",textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:8}}>Visual</div>
                <div style={{height:8,borderRadius:4,background:"rgba(255,255,255,0.05)",overflow:"hidden",marginBottom:6}}>
                  <div style={{height:"100%",width:`${Math.min(beWR,100)}%`,background:"rgba(255,171,0,0.6)",borderRadius:4,position:"relative" as const}}>
                    <div style={{position:"absolute" as const,right:0,top:-2,width:2,height:12,background:"#ffab00"}}/>
                  </div>
                </div>
                <div style={{height:8,borderRadius:4,background:"rgba(255,255,255,0.05)",overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.min(actual,100)}%`,background:actual>=beWR?"#00e676":"#ff1744",borderRadius:4}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#374151",marginTop:4}}>
                  <span>0%</span><span>50%</span><span>100%</span>
                </div>
              </div>
            </div>
          );
        })()}
      </Panel>
    </div>
  );
}
