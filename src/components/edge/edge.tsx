"use client";
import { useMemo } from "react";
import { useAccountStore } from "@/store/accounts";
import { Trade } from "@/types/trade";

const fmt$ = (n:number) => (n>=0?"+":"")+`$${Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

function Panel({title,sub,children}:{title:string;sub?:string;children:React.ReactNode}) {
  return (
    <div style={{background:"linear-gradient(160deg,#0f1520,#0b1017)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:14,padding:18}}>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase" as const,letterSpacing:"0.08em",color:"#4b5563"}}>{title}</div>
        {sub&&<div style={{fontSize:10,color:"#374151",marginTop:2}}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

export default function EdgeAnalyticsPage() {
  const { getActiveTrades } = useAccountStore();
  const trades = getActiveTrades();
  const closed = useMemo(()=>trades.filter(t=>t.status==="CLOSED"&&t.netPnl!==null) as Trade[],[trades]);

  const expectancy = useMemo(()=>{
    if(!closed.length) return { value:0, monthly:0, wr:0, avgW:0, avgL:0 };
    const wins = closed.filter(t=>(t.netPnl||0)>0);
    const losses = closed.filter(t=>(t.netPnl||0)<0);
    const wr = wins.length/closed.length;
    const avgW = wins.length ? wins.reduce((a,t)=>a+t.netPnl!,0)/wins.length : 0;
    const avgL = losses.length ? Math.abs(losses.reduce((a,t)=>a+t.netPnl!,0)/losses.length) : 0;
    const value = wr*avgW - (1-wr)*avgL;
    let monthly = value;
    if(closed.length >= 2){
      const first = new Date(closed[0].entryTime).getTime();
      const last  = new Date(closed[closed.length-1].entryTime).getTime();
      const months = Math.max((last-first)/(1000*60*60*24*30), 1);
      monthly = value * (closed.length/months);
    }
    return { value, monthly, wr: wr*100, avgW, avgL };
  },[closed]);

  const grade = expectancy.value>50?"A+":expectancy.value>20?"A":expectancy.value>5?"B":expectancy.value>0?"C":"F";
  const gradeColor = expectancy.value>20?"#00e676":expectancy.value>0?"#ffab00":"#ff1744";
  const gradeLabel = expectancy.value>50?"Excellent edge":expectancy.value>20?"Good edge":expectancy.value>5?"Marginal edge":expectancy.value>0?"Barely positive":"Losing strategy";

  if(!closed.length) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:"#374151",flexDirection:"column" as const,gap:12}}>
      <div style={{fontSize:36}}>🎯</div>
      <div style={{fontSize:14,fontWeight:700,color:"#f0f6fc"}}>Import trades to see edge analytics</div>
      <div style={{fontSize:12}}>Needs at least a few weeks of trade data to be meaningful</div>
    </div>
  );

  return (
    <div style={{padding:20,overflowY:"auto",height:"100%",display:"flex",flexDirection:"column",gap:14}}>
      <div>
        <h2 style={{fontSize:16,fontWeight:800,color:"#f0f6fc"}}>Edge Analytics</h2>
        <p style={{fontSize:11,color:"#4b5563",marginTop:2}}>How much statistical edge your strategy actually has</p>
      </div>

      <Panel title="Expectancy Rate" sub="How much you make per trade on average, accounting for win rate and avg win/loss">
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
          <div style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"14px 16px"}}>
            <div style={{fontSize:9,color:"#4b5563",textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:4}}>Per Trade</div>
            <div style={{fontSize:28,fontWeight:900,fontFamily:"monospace",color:expectancy.value>=0?"#00e676":"#ff1744"}}>{fmt$(expectancy.value)}</div>
            <div style={{fontSize:11,color:"#4b5563",marginTop:4}}>Expected P&L per trade</div>
          </div>
          <div style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"14px 16px"}}>
            <div style={{fontSize:9,color:"#4b5563",textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:4}}>Monthly Projection</div>
            <div style={{fontSize:28,fontWeight:900,fontFamily:"monospace",color:expectancy.monthly>=0?"#00e676":"#ff1744"}}>{fmt$(expectancy.monthly)}</div>
            <div style={{fontSize:11,color:"#4b5563",marginTop:4}}>Based on your trade frequency</div>
          </div>
          <div style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"14px 16px"}}>
            <div style={{fontSize:9,color:"#4b5563",textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:4}}>Edge Rating</div>
            <div style={{fontSize:28,fontWeight:900,color:gradeColor}}>{grade}</div>
            <div style={{fontSize:11,color:"#4b5563",marginTop:4}}>{gradeLabel}</div>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
          {[
            ["Win Rate", expectancy.wr.toFixed(1)+"%", expectancy.wr>=50?"#00e676":"#ff1744"],
            ["Avg Win",  fmt$(expectancy.avgW), "#00e676"],
            ["Avg Loss", fmt$(-expectancy.avgL), "#ff1744"],
          ].map(([l,v,c])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"10px 14px",background:"rgba(255,255,255,0.02)",borderRadius:9,border:"1px solid rgba(255,255,255,0.05)"}}>
              <span style={{fontSize:12,color:"#6b7280"}}>{l}</span>
              <span style={{fontSize:13,fontWeight:800,fontFamily:"monospace",color:c as string}}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{marginTop:14,padding:"12px 16px",borderRadius:10,background:"rgba(0,229,255,0.04)",border:"1px solid rgba(0,229,255,0.1)",fontSize:12,color:"#6b7280",lineHeight:1.8}}>
          <strong style={{color:"#00e5ff"}}>Formula:</strong> Expectancy = (Win Rate × Avg Win) − (Loss Rate × Avg Loss)<br/>
          A positive expectancy means your strategy makes money over enough trades. Anything above <strong style={{color:"#f0f6fc"}}>$20/trade</strong> is a solid edge.
        </div>
      </Panel>
    </div>
  );
}
