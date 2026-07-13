"use client";
import { useMemo, useState } from "react";
import { useAccountStore } from "@/store/accounts";
import { calculateMetrics, buildEquityCurve, runMonteCarlo } from "@/lib/calculations";
import { EquityChart } from "@/components/charts/equity-chart";
import { CalendarHeatmap } from "@/components/charts/calendar-heatmap";
import { fmt$ } from "@/lib/utils";
import { Trade } from "@/types/trade";
import { exportToCSV } from "@/lib/export";
import AdvancedAnalyticsPage from "@/components/analytics/advanced";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  ReferenceLine, LineChart, Line, CartesianGrid, AreaChart, Area,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter, ZAxis, PieChart, Pie
} from "recharts";

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

const AC: Record<string,string> = {
  STOCK:"#60a5fa",FUTURES:"#a78bfa",FOREX:"#34d399",CRYPTO:"#fbbf24",OPTIONS:"#f87171",ETF:"#6ee7b7",CFD:"#fb923c",
};

export default function AnalyticsPage() {
  const { getActiveTrades, accounts, activeAccountId } = useAccountStore();
  const startBal = accounts.find(a => a.id === activeAccountId)?.startingBalance ?? 0;
  const trades = getActiveTrades();
  const closed = useMemo(()=>trades.filter(t=>t.status==="CLOSED"&&t.netPnl!==null),[trades]);
  const M = useMemo(()=>calculateMetrics(closed as Trade[]),[closed]);
  const equity = useMemo(()=>buildEquityCurve(closed as Trade[], startBal),[closed, startBal]);
  const mc = useMemo(()=>closed.length>5?runMonteCarlo(closed as Trade[],500):null,[closed]);
  const [tab, setTab] = useState<"analytics"|"deep">("analytics");

  const rDist = useMemo(()=>{
    // Use rMultiple if available, otherwise estimate from netPnl / avgLoss
    const avgLoss = M.avgLoss > 0 ? M.avgLoss : Math.abs(M.avgWin) * 0.5;
    const vals = closed
      .map(t => t.rMultiple !== null && t.rMultiple !== undefined
        ? t.rMultiple
        : avgLoss > 0 && t.netPnl !== null ? t.netPnl / avgLoss : null)
      .filter((v): v is number => v !== null && isFinite(v));
    if(!vals.length) return [];
    const mn=Math.floor(Math.min(...vals,-3)), mx=Math.ceil(Math.max(...vals,3));
    const bk: Record<string,number>={};
    for(let v=mn;v<=mx;v+=0.5) bk[v.toFixed(1)]=0;
    vals.forEach(v=>{const k=(Math.round(v*2)/2).toFixed(1);bk[k]=(bk[k]||0)+1;});
    return Object.entries(bk).map(([r,count])=>({r:+r,label:r+"R",count})).sort((a,b)=>a.r-b.r);
  },[closed, M]);

  const ddSeries = useMemo(()=>equity.map((_,i)=>({i,dd:-equity[i].drawdownPct})),[equity]);

  const pnlDist = useMemo(()=>{
    const p=closed.map(t=>t.netPnl!).filter(v=>isFinite(v));
    if(!p.length) return [];
    const mn=Math.min(...p),mx=Math.max(...p);
    const step=(mx-mn)/16;
    if(step===0) return [{lo:mn.toFixed(0),count:p.length,mid:mn}];
    return Array.from({length:16},(_,i)=>{
      const lo=mn+i*step,hi=lo+step;
      return {lo:lo.toFixed(0),count:p.filter(v=>v>=lo&&v<hi).length,mid:(lo+hi)/2};
    });
  },[closed]);

  const monthly = useMemo(()=>{
    const m: Record<string,{pnl:number;count:number}>={};
    for(const t of closed){const k=new Date(t.entryTime).toLocaleDateString("en-US",{year:"2-digit",month:"short"});if(!m[k])m[k]={pnl:0,count:0};m[k].pnl+=t.netPnl||0;m[k].count++;}
    return Object.entries(m).map(([mo,v])=>({mo,...v}));
  },[closed]);

  const byStrat = useMemo(()=>{
    const m: Record<string,{pnl:number;count:number;wins:number}>={};
    for(const t of closed){const k=t.strategy||"—";if(!m[k])m[k]={pnl:0,count:0,wins:0};m[k].pnl+=t.netPnl||0;m[k].count++;if((t.netPnl||0)>0)m[k].wins++;}
    return Object.entries(m).map(([s,v])=>({strat:s,...v,wr:(v.wins/v.count*100).toFixed(0)+"%"})).sort((a,b)=>b.pnl-a.pnl).slice(0,8);
  },[closed]);

  const byAsset = useMemo(()=>{
    const m: Record<string,{pnl:number;count:number}>={};
    for(const t of closed){const k=t.assetClass||"STOCK";if(!m[k])m[k]={pnl:0,count:0};m[k].pnl+=t.netPnl||0;m[k].count++;}
    return Object.entries(m).map(([name,v])=>({name,...v}));
  },[closed]);

  const scatter = useMemo(()=>closed.filter(t=>t.holdTimeSeconds&&t.netPnl!==null).map(t=>({hold:Math.round((t.holdTimeSeconds||0)/3600*10)/10,pnl:t.netPnl||0,ticker:t.ticker})).slice(0,300),[closed]);

  const radar = useMemo(()=>[
    {metric:"Win Rate",value:M.winRate*100},
    {metric:"Prof. Factor",value:Math.min(M.profitFactor,5)*20},
    {metric:"Expectancy",value:Math.max(0,Math.min(100,(M.expectancy+500)/10))},
    {metric:"Drawdown",value:Math.max(0,100-M.maxDrawdown/Math.max(1,Math.abs(M.totalNetPnl))*100)},
    {metric:"Avg R",value:Math.max(0,Math.min(100,(M.avgRMultiple+2)*25))},
  ],[M]);

  const recentBar = useMemo(()=>[...closed].sort((a,b)=>new Date(b.entryTime).getTime()-new Date(a.entryTime).getTime()).slice(0,30).reverse().map((t,i)=>({i,pnl:t.netPnl||0,ticker:t.ticker})),[closed]);

  const byDay = useMemo(()=>{
    const days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const acc:Record<string,number>={};
    days.forEach(d=>{acc[d]=0;});
    closed.forEach(t=>{ const d=days[new Date(t.entryTime||"").getDay()]; acc[d]=(acc[d]||0)+(t.netPnl||0); });
    return days.map(d=>({day:d,pnl:acc[d]}));
  },[closed]);

  const calendar = useMemo(()=>{
    const acc:Record<string,{pnl:number;count:number}>={};
    closed.forEach(t=>{ const d=(t.entryTime||"").slice(0,10); if(!acc[d])acc[d]={pnl:0,count:0}; acc[d].pnl+=(t.netPnl||0); acc[d].count++; });
    return acc;
  },[closed]);

  if(!closed.length) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#374151",flexDirection:"column" as const,gap:12}}>
      <div style={{fontSize:36}}>📊</div><div>Import trades to see analytics</div>
    </div>
  );

  return (
    <div style={{ padding:20, overflowY:"auto", height:"100%", display:"flex", flexDirection:"column", gap:14 }}>
      {/* Tab switcher + export */}
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        {(["analytics","deep"] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{ height:30, padding:"0 16px", borderRadius:20, border:"1px solid", fontSize:12, fontWeight:700, cursor:"pointer", transition:"all 0.12s",
            borderColor:tab===t?"rgba(0,229,255,0.4)":"rgba(255,255,255,0.08)",
            background:tab===t?"rgba(0,229,255,0.1)":"rgba(255,255,255,0.03)",
            color:tab===t?"#00e5ff":"#4b5563",
          }}>{t==="analytics"?"Analytics":"Deep Stats"}</button>
        ))}
        <span style={{fontSize:10,color:"#4b5563",marginLeft:4}}>{closed.length} closed trades</span>
        <button onClick={()=>exportToCSV(closed as Trade[], `traderhub_analytics_${new Date().toISOString().slice(0,10)}.csv`)}
          style={{ height:28, padding:"0 14px", borderRadius:8, border:"1px solid rgba(0,229,255,0.2)", background:"rgba(0,229,255,0.06)", color:"#00e5ff", fontSize:11, fontWeight:700, cursor:"pointer", marginLeft:"auto" }}>
          ↓ Export CSV
        </button>
      </div>

      {/* Deep Stats tab */}
      {tab==="deep" && <AdvancedAnalyticsPage/>}

      {/* Analytics tab content */}
      {tab==="analytics" && <>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        <Panel title="Equity Curve" sub={"Total: "+fmt$(equity[equity.length-1]?.equity||0)}>
          <EquityChart data={equity} height={195} startingBalance={startBal}/>
        </Panel>
        <Panel title="Drawdown %" sub="Distance below peak equity">
          <ResponsiveContainer width="100%" height={195}>
            <AreaChart data={ddSeries} margin={{top:4,right:4,left:0,bottom:0}}>
              <defs><linearGradient id="ddG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f87171" stopOpacity={0.35}/><stop offset="100%" stopColor="#f87171" stopOpacity={0}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.03)" vertical={false}/>
              <XAxis dataKey="i" tick={{fontSize:9,fill:"#374151"}} axisLine={false} tickLine={false}/>
              <YAxis tickFormatter={v=>v.toFixed(1)+"%"} tick={{fontSize:9,fill:"#374151"}} axisLine={false} tickLine={false} width={46}/>
              <Tooltip {...TTP} formatter={(v:any)=>[(v as number).toFixed(2)+"%","Drawdown"]}/>
              <Area type="monotone" dataKey="dd" stroke="#f87171" strokeWidth={1.5} fill="url(#ddG)" dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        <Panel title="R-Multiple Distribution" sub="How often each R outcome occurred">
          <ResponsiveContainer width="100%" height={185}>
            <BarChart data={rDist} margin={{top:4,right:4,left:0,bottom:0}}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.03)" vertical={false}/>
              <XAxis dataKey="label" tick={{fontSize:8,fill:"#374151"}} axisLine={false} tickLine={false} interval={1}/>
              <YAxis tick={{fontSize:9,fill:"#374151"}} axisLine={false} tickLine={false} width={28}/>
              <ReferenceLine x="0.0R" stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4"/>
              <Tooltip {...TTP} formatter={(v:any)=>[v,"trades"]}/>
              <Bar dataKey="count" radius={[3,3,0,0]}>
                {rDist.map((d,i)=><Cell key={i} fill={d.r>=0?"#34d399":"#f87171"} fillOpacity={0.75}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="P&L Distribution" sub="Frequency of each profit/loss range">
          <ResponsiveContainer width="100%" height={185}>
            <BarChart data={pnlDist} margin={{top:4,right:4,left:0,bottom:0}}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.03)" vertical={false}/>
              <XAxis dataKey="lo" tick={{fontSize:9,fill:"#374151"}} axisLine={false} tickLine={false} interval={3}/>
              <YAxis tick={{fontSize:9,fill:"#374151"}} axisLine={false} tickLine={false} width={28}/>
              <Tooltip {...TTP} formatter={(v:any)=>[v,"trades"]}/>
              <Bar dataKey="count" radius={[3,3,0,0]}>
                {pnlDist.map((d,i)=><Cell key={i} fill={+d.mid>=0?"#34d399":"#f87171"} fillOpacity={0.75}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        <Panel title="Monthly P&L">
          <ResponsiveContainer width="100%" height={185}>
            <BarChart data={monthly} margin={{top:4,right:4,left:0,bottom:0}}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.03)" vertical={false}/>
              <XAxis dataKey="mo" tick={{fontSize:9,fill:"#374151"}} axisLine={false} tickLine={false}/>
              <YAxis tickFormatter={v=>"$"+v.toFixed(0)} tick={{fontSize:9,fill:"#374151"}} axisLine={false} tickLine={false} width={50}/>
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)"/>
              <Tooltip {...TTP} formatter={(v:any)=>[fmt$(v as number),"P&L"]}/>
              <Bar dataKey="pnl" radius={[3,3,0,0]}>
                {monthly.map((d,i)=><Cell key={i} fill={d.pnl>=0?"#34d399":"#f87171"} fillOpacity={0.8}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Performance by Strategy">
          {byStrat.length===0
            ?<div style={{color:"#374151",fontSize:12,padding:"30px 0",textAlign:"center" as const}}>No strategy tags found</div>
            :<table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
                {["Strategy","Trades","Net P&L","Win%"].map(h=><th key={h} style={{padding:"5px 8px",textAlign:"left" as const,fontSize:10,fontWeight:700,color:"#4b5563",textTransform:"uppercase" as const,letterSpacing:"0.06em"}}>{h}</th>)}
              </tr></thead>
              <tbody>{byStrat.map(r=>(
                <tr key={r.strat} style={{borderBottom:"1px solid rgba(255,255,255,0.03)"}}>
                  <td style={{padding:"7px 8px",fontWeight:600,color:"#d1d5db"}}>{r.strat}</td>
                  <td style={{padding:"7px 8px",color:"#6b7280"}}>{r.count}</td>
                  <td style={{padding:"7px 8px",fontFamily:"monospace",fontWeight:700,color:r.pnl>=0?"#34d399":"#f87171"}}>{fmt$(r.pnl)}</td>
                  <td style={{padding:"7px 8px",color:+r.wr.replace("%","")>=50?"#34d399":"#f87171"}}>{r.wr}</td>
                </tr>
              ))}</tbody>
            </table>
          }
        </Panel>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        <Panel title="P&L by Asset Class">
          <div style={{ display:"flex", alignItems:"center", gap:20 }}>
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={byAsset} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={35}>
                  {byAsset.map((d,i)=><Cell key={i} fill={AC[d.name]||"#6b7280"} fillOpacity={0.85}/>)}
                </Pie>
                <Tooltip {...TTP} formatter={(v:any,n:any)=>[v+" trades",n]}/>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              {byAsset.map(d=>(
                <div key={d.name} style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ width:8, height:8, borderRadius:2, background:AC[d.name]||"#6b7280", flexShrink:0 }}/>
                  <span style={{ fontSize:11, color:"#d1d5db", width:60 }}>{d.name}</span>
                  <span style={{ fontSize:11, fontFamily:"monospace", fontWeight:700, color:d.pnl>=0?"#34d399":"#f87171" }}>{fmt$(d.pnl)}</span>
                  <span style={{ fontSize:10, color:"#4b5563" }}>{d.count}t</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Performance Radar">
          <ResponsiveContainer width="100%" height={185}>
            <RadarChart data={radar}>
              <PolarGrid stroke="rgba(255,255,255,0.06)"/>
              <PolarAngleAxis dataKey="metric" tick={{fontSize:10,fill:"#6b7280"}}/>
              <PolarRadiusAxis angle={90} domain={[0,100]} tick={false} axisLine={false}/>
              <Radar name="Score" dataKey="value" stroke="#00b4d8" fill="#00b4d8" fillOpacity={0.15} strokeWidth={2}/>
              <Tooltip {...TTP} formatter={(v:any)=>[(v as number).toFixed(2),"Score"]}/>
            </RadarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        <Panel title="Hold Time vs P&L Scatter" sub="Each dot = 1 trade">
          <ResponsiveContainer width="100%" height={185}>
            <ScatterChart margin={{top:4,right:4,left:0,bottom:16}}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.03)"/>
              <XAxis type="number" dataKey="hold" name="Hold (hrs)" tick={{fontSize:9,fill:"#374151"}} axisLine={false} tickLine={false} label={{value:"Hold (hrs)",position:"insideBottom",offset:-8,style:{fill:"#374151",fontSize:9}}}/>
              <YAxis type="number" dataKey="pnl" name="P&L" tickFormatter={v=>"$"+v.toFixed(0)} tick={{fontSize:9,fill:"#374151"}} axisLine={false} tickLine={false} width={52}/>
              <ZAxis range={[20,20]}/>
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)"/>
              <Tooltip content={({payload})=>{ if(!payload?.length) return null; const d=payload[0].payload; return <div style={TTP.contentStyle}><div style={{color:"#6b7280"}}>{d.ticker}</div><div style={{color:d.pnl>=0?"#34d399":"#f87171",fontFamily:"monospace"}}>{fmt$(d.pnl)}</div><div style={{color:"#6b7280"}}>{d.hold}h</div></div>; }}/>
              <Scatter data={scatter}>
                {scatter.map((d,i)=><Cell key={i} fill={d.pnl>=0?"#34d399":"#f87171"} fillOpacity={0.65}/>)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Last 30 Trades" sub="Win/loss bar for most recent trades">
          <ResponsiveContainer width="100%" height={185}>
            <BarChart data={recentBar} margin={{top:4,right:4,left:0,bottom:0}}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.03)" vertical={false}/>
              <XAxis dataKey="ticker" tick={{fontSize:8,fill:"#374151"}} axisLine={false} tickLine={false} interval={4}/>
              <YAxis tickFormatter={v=>"$"+v.toFixed(0)} tick={{fontSize:9,fill:"#374151"}} axisLine={false} tickLine={false} width={50}/>
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)"/>
              <Tooltip {...TTP} formatter={(v:any,_:any,p:any)=>[fmt$(p.payload.pnl),p.payload.ticker]}/>
              <Bar dataKey="pnl" radius={[3,3,0,0]}>
                {recentBar.map((d,i)=><Cell key={i} fill={d.pnl>=0?"#34d399":"#f87171"} fillOpacity={0.8}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {mc && (
        <Panel title="Monte Carlo Simulation" sub="500 runs — range of possible outcomes">
          <div style={{ display:"flex", gap:20, marginBottom:12 }}>
            {([["Worst 5%",mc.percentiles.p5,"#f87171"],["P25",mc.percentiles.p25,"#fbbf24"],["Median",mc.percentiles.p50,"#60a5fa"],["P75",mc.percentiles.p75,"#34d399"],["Best 5%",mc.percentiles.p95,"#6ee7b7"]] as [string,number,string][]).map(([l,v,c])=>(
              <div key={l}><div style={{fontSize:9,color:"#4b5563",marginBottom:2,textTransform:"uppercase" as const,letterSpacing:"0.06em"}}>{l}</div><div style={{fontFamily:"monospace",fontWeight:700,color:c,fontSize:13}}>{fmt$(v)}</div></div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={Array.from({length:mc.paths[0]?.length||0},(_,i)=>({i,min:mc.paths.reduce((m,p)=>Math.min(m,p[i]),Infinity),max:mc.paths.reduce((m,p)=>Math.max(m,p[i]),-Infinity),med:mc.paths.map(p=>p[i]).sort((a,b)=>a-b)[Math.floor(mc.paths.length/2)]}))} margin={{top:4,right:4,left:0,bottom:0}}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.03)" vertical={false}/>
              <XAxis dataKey="i" tick={{fontSize:9,fill:"#374151"}} axisLine={false} tickLine={false}/>
              <YAxis tickFormatter={v=>"$"+v.toFixed(0)} tick={{fontSize:9,fill:"#374151"}} axisLine={false} tickLine={false} width={52}/>
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)"/>
              <Tooltip {...TTP} formatter={(v:any,n:any)=>[fmt$(v as number),n]}/>
              <Line type="monotone" dataKey="max" stroke="rgba(52,211,153,0.2)" dot={false} strokeWidth={1}/>
              <Line type="monotone" dataKey="med" stroke="#60a5fa" dot={false} strokeWidth={2}/>
              <Line type="monotone" dataKey="min" stroke="rgba(248,113,113,0.2)" dot={false} strokeWidth={1}/>
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      )}
      <div style={{ display:"grid", gridTemplateColumns:"300px 1fr", gap:14 }}>
        <Panel title="P&L by Day of Week">
          <ResponsiveContainer width="100%" height={155}>
            <BarChart data={byDay} margin={{top:4,right:0,left:0,bottom:0}}>
              <CartesianGrid strokeDasharray="1 6" stroke="rgba(255,255,255,0.03)" vertical={false}/>
              <XAxis dataKey="day" tick={{fontSize:11,fill:"#3d4551"}} axisLine={false} tickLine={false}/>
              <YAxis tickFormatter={v=>"$"+v.toFixed(0)} tick={{fontSize:9,fill:"#3d4551"}} axisLine={false} tickLine={false} width={46}/>
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.06)"/>
              <Tooltip {...TTP} formatter={(v:any)=>[fmt$(v as number),"P&L"]}/>
              <Bar dataKey="pnl" radius={[4,4,0,0]} maxBarSize={34}>
                {byDay.map((d,i)=><Cell key={i} fill={d.pnl>=0?"#00e676":"#ff1744"} fillOpacity={0.8}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title={`Trade Calendar — ${new Date().getFullYear()}`}>
          <CalendarHeatmap data={calendar}/>
          <div style={{display:"flex",gap:16,marginTop:12,fontSize:10,color:"#3d4551"}}>
            {[["rgba(255,23,68,0.6)","rgba(255,23,68,0.3)","Loss day"],["rgba(255,255,255,0.03)","rgba(255,255,255,0.05)","No trades"],["rgba(0,230,118,0.6)","rgba(0,230,118,0.3)","Profit day"]].map(([bg,border,label])=>(
              <div key={label} style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:10,height:10,borderRadius:3,background:bg,border:`1px solid ${border}`}}/>{label}
              </div>
            ))}
          </div>
        </Panel>
      </div>
      </>}
    </div>
  );
}
