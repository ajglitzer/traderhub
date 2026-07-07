"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { useAccountStore } from "@/store/accounts";
import { Trade } from "@/types/trade";

const fmt$ = (n:number) => (n>=0?"+":"")+`$${Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

// ── Build a rich data summary to feed the AI ──────────────────────────────────
function buildAnalysisPrompt(trades: Trade[]): string {
  const closed = trades.filter(t => t.status==="CLOSED" && t.netPnl!==null);
  if (!closed.length) return "";

  const totalPnl = closed.reduce((a,t)=>a+t.netPnl!,0);
  const wins = closed.filter(t=>t.netPnl!>0);
  const losses = closed.filter(t=>t.netPnl!<0);
  const wr = (wins.length/closed.length*100).toFixed(1);

  // By hour of day
  const byHour: Record<number,{pnl:number;count:number}> = {};
  closed.forEach(t=>{
    const h=new Date(t.entryTime).getHours();
    if(!byHour[h]) byHour[h]={pnl:0,count:0};
    byHour[h].pnl+=t.netPnl!; byHour[h].count++;
  });
  const hourStats = Object.entries(byHour)
    .map(([h,v])=>({hour:+h,...v,wr:closed.filter(t=>new Date(t.entryTime).getHours()===+h&&t.netPnl!>0).length/v.count}))
    .sort((a,b)=>b.pnl-a.pnl);

  // By day of week
  const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const byDay: Record<number,{pnl:number;count:number}> = {};
  closed.forEach(t=>{
    const d=new Date(t.entryTime).getDay();
    if(!byDay[d]) byDay[d]={pnl:0,count:0};
    byDay[d].pnl+=t.netPnl!; byDay[d].count++;
  });

  // By ticker
  const byTicker: Record<string,{pnl:number;count:number;wins:number}> = {};
  closed.forEach(t=>{
    const k=t.ticker.replace(/\d+!$/,"");
    if(!byTicker[k]) byTicker[k]={pnl:0,count:0,wins:0};
    byTicker[k].pnl+=t.netPnl!; byTicker[k].count++;
    if(t.netPnl!>0) byTicker[k].wins++;
  });

  // By tag
  const byTag: Record<string,{pnl:number;count:number;wins:number}> = {};
  closed.forEach(t=>(t.tags||[]).forEach(tag=>{
    if(!byTag[tag]) byTag[tag]={pnl:0,count:0,wins:0};
    byTag[tag].pnl+=t.netPnl!; byTag[tag].count++;
    if(t.netPnl!>0) byTag[tag].wins++;
  }));

  // Hold time analysis
  const shortTrades = closed.filter(t=>(t.holdTimeSeconds||0)<300);
  const medTrades   = closed.filter(t=>(t.holdTimeSeconds||0)>=300&&(t.holdTimeSeconds||0)<3600);
  const longTrades  = closed.filter(t=>(t.holdTimeSeconds||0)>=3600);
  const avgPnl=(arr:Trade[])=>arr.length?arr.reduce((a,t)=>a+t.netPnl!,0)/arr.length:0;

  // Consecutive losses
  let maxConsecLoss=0,cur=0;
  closed.forEach(t=>{ if(t.netPnl!<0){cur++;maxConsecLoss=Math.max(maxConsecLoss,cur);}else cur=0; });

  // Recent trend (last 20 trades)
  const recent=closed.slice(-20);
  const recentPnl=recent.reduce((a,t)=>a+t.netPnl!,0);
  const recentWR=(recent.filter(t=>t.netPnl!>0).length/recent.length*100).toFixed(1);

  // Streak pattern: trades after a loss
  const afterLoss=closed.filter((_,i)=>i>0&&closed[i-1].netPnl!<0);
  const afterLossWR=afterLoss.length?(afterLoss.filter(t=>t.netPnl!>0).length/afterLoss.length*100).toFixed(1):"N/A";

  // Largest winners vs losers
  const top5W=[...wins].sort((a,b)=>b.netPnl!-a.netPnl!).slice(0,5);
  const top5L=[...losses].sort((a,b)=>a.netPnl!-b.netPnl!).slice(0,5);

  return `You are an expert trading performance analyst. Analyze this trader's complete data and identify specific, actionable patterns. Be direct. Reference exact numbers. Do NOT give generic advice.

=== TRADER SUMMARY ===
Total trades: ${closed.length} | Net P&L: ${fmt$(totalPnl)} | Win rate: ${wr}% | Wins: ${wins.length} | Losses: ${losses.length}
Max consecutive losses: ${maxConsecLoss}
Recent form (last 20): P&L ${fmt$(recentPnl)} | Win rate ${recentWR}%
Win rate after a loss: ${afterLossWR}% (revenge trading signal)

=== HOURLY PERFORMANCE (top 5 best/worst) ===
BEST hours: ${hourStats.slice(0,5).map(h=>`${h.hour}:00 (${fmt$(h.pnl)}, ${h.count}t, ${(h.wr*100).toFixed(0)}%WR)`).join(" | ")}
WORST hours: ${hourStats.slice(-5).reverse().map(h=>`${h.hour}:00 (${fmt$(h.pnl)}, ${h.count}t, ${(h.wr*100).toFixed(0)}%WR)`).join(" | ")}

=== DAY OF WEEK ===
${Object.entries(byDay).map(([d,v])=>`${DAYS[+d]}: ${fmt$(v.pnl)} (${v.count} trades)`).join(" | ")}

=== BY TICKER ===
${Object.entries(byTicker).map(([t,v])=>`${t}: ${fmt$(v.pnl)} (${v.count}t, ${(v.wins/v.count*100).toFixed(0)}%WR)`).join(" | ")}

=== BY SETUP TAG ===
${Object.keys(byTag).length ? Object.entries(byTag).map(([t,v])=>`${t}: ${fmt$(v.pnl)} (${v.count}t, ${(v.wins/v.count*100).toFixed(0)}%WR)`).join(" | ") : "No tags set on trades"}

=== HOLD TIME BREAKDOWN ===
< 5 min (scalp): ${shortTrades.length} trades, avg P&L ${fmt$(avgPnl(shortTrades))}
5 min - 1 hr: ${medTrades.length} trades, avg P&L ${fmt$(avgPnl(medTrades))}
> 1 hr (swing): ${longTrades.length} trades, avg P&L ${fmt$(avgPnl(longTrades))}

=== TOP 5 WINNERS ===
${top5W.map(t=>`${t.ticker} ${t.side} | Entry:${t.entryPrice} Exit:${t.exitPrice||"?"} | ${fmt$(t.netPnl!)} | Hold:${Math.round((t.holdTimeSeconds||0)/60)}min | Tags:${(t.tags||[]).join(",")||"none"}`).join("\n")}

=== TOP 5 LOSERS ===
${top5L.map(t=>`${t.ticker} ${t.side} | Entry:${t.entryPrice} Exit:${t.exitPrice||"?"} | ${fmt$(t.netPnl!)} | Hold:${Math.round((t.holdTimeSeconds||0)/60)}min | Tags:${(t.tags||[]).join(",")||"none"}`).join("\n")}

Provide your analysis in EXACTLY this format:

## 🔍 Key Patterns Found
3-5 specific patterns you identified with exact numbers. Example: "You lose 73% of trades taken after 2pm EST" not "you trade worse later in the day."

## ⚠️ Critical Weaknesses
2-3 specific behaviors costing real money. Include the dollar amount.

## ✅ Hidden Strengths
2-3 things working well that the trader may not realize. Be specific.

## 🕐 Optimal Trading Window
The exact hours and days where their data shows the best performance.

## 🎯 The #1 Change To Make
One specific rule change that would have the largest immediate impact on P&L, with an estimated dollar improvement based on the data.

## 📋 Personalized Rules (based on THIS trader's data)
5 specific rules written for this trader's exact patterns. Not generic advice — rules derived from their numbers.`;
}

function renderMd(md: string) {
  return md.split("\n").map((line, i) => {
    if (line.startsWith("## ")) return (
      <div key={i} style={{fontSize:14,fontWeight:800,color:"#00e5ff",marginTop:22,marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
        {line.slice(3)}
      </div>
    );
    if (line.startsWith("- ") || line.startsWith("• ")) return (
      <div key={i} style={{display:"flex",gap:8,marginBottom:5,paddingLeft:4}}>
        <span style={{color:"#00e5ff",flexShrink:0,marginTop:2}}>▸</span>
        <span style={{fontSize:13,color:"#c9d1d9",lineHeight:1.65}}
          dangerouslySetInnerHTML={{__html:line.slice(2).replace(/\*\*(.*?)\*\*/g,"<strong style='color:#f0f6fc'>$1</strong>")}}/>
      </div>
    );
    if (line.trim() === "") return <div key={i} style={{height:6}}/>;
    return (
      <p key={i} style={{fontSize:13,color:"#c9d1d9",lineHeight:1.7,marginBottom:4}}
        dangerouslySetInnerHTML={{__html:line.replace(/\*\*(.*?)\*\*/g,"<strong style='color:#f0f6fc'>$1</strong>")}}/>
    );
  });
}

export default function PatternPage() {
  const { getActiveTrades } = useAccountStore();
  const trades = getActiveTrades();
  const closed = useMemo(()=>trades.filter(t=>t.status==="CLOSED"&&t.netPnl!==null) as Trade[],[trades]);

  const [status, setStatus] = useState<"idle"|"loading"|"streaming"|"done"|"error">("idle");
  const [text,   setText]   = useState("");
  const [errMsg, setErrMsg] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(()=>{ if(scrollRef.current) scrollRef.current.scrollTop=scrollRef.current.scrollHeight; },[text]);

  const analyze = async () => {
    const prompt = buildAnalysisPrompt(trades);
    if (!prompt) { setErrMsg("No closed trades to analyze."); setStatus("error"); return; }
    setStatus("loading"); setText(""); setErrMsg("");
    try {
      const res = await fetch("/api/analyze", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({prompt}),
      });
      if (!res.ok) {
        const j = await res.json().catch(()=>({error:`HTTP ${res.status}`}));
        throw new Error(j.error||`HTTP ${res.status}`);
      }
      if (!res.body) throw new Error("No response body");
      setStatus("streaming");
      const reader=res.body.getReader();
      const dec=new TextDecoder();
      let buf="";
      while(true){
        const{done,value}=await reader.read();
        if(done) break;
        buf+=dec.decode(value,{stream:true});
        const lines=buf.split("\n");
        buf=lines.pop()||"";
        for(const line of lines){
          if(!line.startsWith("data: ")) continue;
          const data=line.slice(6).trim();
          if(data==="[DONE]") continue;
          try{const j=JSON.parse(data);const d=j?.choices?.[0]?.delta?.content||"";if(d)setText(t=>t+d);}catch{}
        }
      }
      setStatus("done");
    } catch(e){setErrMsg(String(e));setStatus("error");}
  };

  // Quick stats for the header
  const totalPnl = closed.reduce((a,t)=>a+t.netPnl!,0);
  const wr = closed.length ? closed.filter(t=>t.netPnl!>0).length/closed.length*100 : 0;

  // Best hour
  const byHour: Record<number,number> = {};
  closed.forEach(t=>{ const h=new Date(t.entryTime).getHours(); byHour[h]=(byHour[h]||0)+t.netPnl!; });
  const bestHour = Object.entries(byHour).sort(([,a],[,b])=>b-a)[0];
  const worstHour = Object.entries(byHour).sort(([,a],[,b])=>a-b)[0];

  return (
    <div style={{padding:20,overflowY:"auto",height:"100%",display:"flex",flexDirection:"column",gap:14}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap" as const,gap:10}}>
        <div>
          <h2 style={{fontSize:16,fontWeight:800,color:"#f0f6fc"}}>AI Pattern Recognition</h2>
          <p style={{fontSize:11,color:"#4b5563",marginTop:2}}>Claude analyzes all {closed.length} of your trades to find hidden patterns · Powered by Groq · Free</p>
        </div>
        <button onClick={analyze} disabled={status==="loading"||status==="streaming"||closed.length<5} style={{
          height:40,padding:"0 28px",borderRadius:12,border:"none",
          background:closed.length<5?"rgba(255,255,255,0.05)":"linear-gradient(135deg,#00e5ff,#0088bb)",
          color:closed.length<5?"#374151":"#000",
          cursor:closed.length<5?"default":status==="loading"||status==="streaming"?"default":"pointer",
          fontSize:13,fontWeight:800,boxShadow:closed.length>=5?"0 0 24px rgba(0,229,255,0.25)":"none",
          display:"flex",alignItems:"center",gap:8,opacity:status==="loading"||status==="streaming"?0.7:1,
          transition:"all 0.15s",
        }}>
          {status==="loading"||status==="streaming"
            ? <><div style={{width:14,height:14,borderRadius:"50%",border:"2px solid rgba(0,0,0,0.3)",borderTop:"2px solid #000",animation:"spin 0.8s linear infinite"}}/>Analyzing {closed.length} trades...</>
            : <>✦ Analyze My Patterns</>
          }
        </button>
      </div>

      {/* Quick stat strip */}
      {closed.length > 0 && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10}}>
          {[
            ["Trades Analyzed", closed.length.toString(), "#c9d1d9"],
            ["Overall P&L",     fmt$(totalPnl),           totalPnl>=0?"#00e676":"#ff1744"],
            ["Win Rate",        wr.toFixed(1)+"%",        wr>=50?"#00e676":"#ff1744"],
            ["Best Hour",       bestHour?`${bestHour[0]}:00 (${fmt$(+bestHour[1])})`:"—","#00e676"],
            ["Worst Hour",      worstHour?`${worstHour[0]}:00 (${fmt$(+worstHour[1])})`:"—","#ff1744"],
          ].map(([l,v,c])=>(
            <div key={l as string} style={{background:"linear-gradient(160deg,#0f1520,#0b1017)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12,padding:"12px 14px"}}>
              <div style={{fontSize:9,color:"#4b5563",textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:4}}>{l}</div>
              <div style={{fontSize:15,fontWeight:800,fontFamily:"monospace",color:c as string,wordBreak:"break-all" as const}}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* AI Output panel */}
      <div style={{
        background:"linear-gradient(160deg,#0f1520,#0b1017)",
        border:"1px solid rgba(0,229,255,0.12)",
        borderRadius:16,flex:1,minHeight:300,overflow:"hidden",
        boxShadow:"0 0 40px rgba(0,229,255,0.04)",
        display:"flex",flexDirection:"column",
      }}>
        {/* Panel header */}
        <div style={{padding:"12px 18px",borderBottom:"1px solid rgba(255,255,255,0.05)",background:"rgba(0,0,0,0.25)",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:status==="streaming"?"#00e5ff":status==="done"?"#00e676":status==="error"?"#ff1744":"#374151",boxShadow:status==="streaming"?"0 0 8px #00e5ff":status==="done"?"0 0 8px #00e676":"none"}}/>
          <span style={{fontSize:11,color:"#4b5563"}}>
            {status==="idle"     ?"Waiting for analysis"
            :status==="loading"  ?"Preparing analysis..."
            :status==="streaming"?"Analyzing patterns in real time..."
            :status==="done"     ?"Analysis complete"
            :"Error"}
          </span>
          {status==="done" && (
            <button onClick={analyze} style={{marginLeft:"auto",height:26,padding:"0 12px",borderRadius:7,border:"1px solid rgba(0,229,255,0.2)",background:"rgba(0,229,255,0.06)",color:"#00e5ff",fontSize:11,fontWeight:700,cursor:"pointer"}}>
              Re-analyze
            </button>
          )}
        </div>

        {/* Content */}
        <div ref={scrollRef} style={{flex:1,overflowY:"auto",padding:"20px 22px"}}>

          {status==="idle" && (
            <div style={{display:"flex",flexDirection:"column" as const,alignItems:"center",justifyContent:"center",height:"100%",gap:16,padding:"48px 0"}}>
              <div style={{width:64,height:64,borderRadius:18,background:"rgba(0,229,255,0.06)",border:"1px solid rgba(0,229,255,0.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>✦</div>
              <div style={{textAlign:"center" as const,maxWidth:460}}>
                <div style={{fontSize:16,fontWeight:800,color:"#f0f6fc",marginBottom:8}}>Ready to analyze your trading patterns</div>
                <div style={{fontSize:13,color:"#4b5563",lineHeight:1.7}}>
                  {closed.length < 5
                    ? `You need at least 5 closed trades to run pattern analysis. You currently have ${closed.length}.`
                    : `The AI will scan all ${closed.length} of your trades and identify patterns in your time-of-day performance, setup quality, hold time tendencies, and behavioral biases — then give you specific rules based on your own data.`
                  }
                </div>
              </div>
              {closed.length >= 5 && (
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,maxWidth:400,width:"100%"}}>
                  {["Hourly & daily performance patterns","Best and worst setups by tag","Hold time vs outcome analysis","Revenge trading detection","Optimal trading window","Personalized trading rules"].map(item=>(
                    <div key={item} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#4b5563"}}>
                      <span style={{color:"#00e5ff",flexShrink:0}}>✓</span>{item}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {status==="loading" && (
            <div style={{display:"flex",flexDirection:"column" as const,alignItems:"center",justifyContent:"center",height:"100%",gap:14,padding:"48px 0"}}>
              <div style={{width:40,height:40,borderRadius:"50%",border:"2px solid rgba(0,229,255,0.15)",borderTop:"2px solid #00e5ff",animation:"spin 0.8s linear infinite"}}/>
              <div style={{fontSize:13,color:"#4b5563"}}>Sending {closed.length} trades to Groq AI...</div>
            </div>
          )}

          {(status==="streaming"||status==="done") && (
            <div>
              {renderMd(text)}
              {status==="streaming" && (
                <span style={{display:"inline-block",width:2,height:15,background:"#00e5ff",marginLeft:2,animation:"blink 0.8s infinite",verticalAlign:"middle"}}/>
              )}
            </div>
          )}

          {status==="error" && (
            <div style={{textAlign:"center" as const,padding:"40px 0"}}>
              <div style={{fontSize:26,marginBottom:12}}>⚠️</div>
              <div style={{fontSize:14,fontWeight:700,color:"#ff1744",marginBottom:10}}>Analysis failed</div>
              <pre style={{fontSize:11,color:"#4b5563",whiteSpace:"pre-wrap" as const,textAlign:"left" as const,maxWidth:480,margin:"0 auto",background:"rgba(255,255,255,0.02)",borderRadius:8,padding:"12px 14px"}}>{errMsg}</pre>
              <button onClick={analyze} style={{marginTop:16,height:34,padding:"0 20px",borderRadius:9,background:"rgba(0,229,255,0.1)",border:"1px solid rgba(0,229,255,0.25)",color:"#00e5ff",fontSize:12,fontWeight:700,cursor:"pointer"}}>Retry</button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0; } }
      `}</style>
    </div>
  );
}
