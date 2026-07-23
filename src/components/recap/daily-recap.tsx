"use client";
import { useSubscription } from "@/hooks/useSubscription";
import { PricingModal } from "@/components/subscription/pro-gate";
import { boldOnly } from "@/lib/safe-markdown";
import { AiLimitGate } from "@/components/ui/ai-limit-gate";
import { scopedKey } from "@/lib/user-storage";
import { useState, useEffect, useRef } from "react";
import { useAccountStore } from "@/store/accounts";
import { Trade } from "@/types/trade";

const fmt$ = (n:number) => (n>=0?"+":"")+`$${Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

function buildRecapPrompt(trades: Trade[], date: string): string {
  if (!trades.length) return `No trades were taken on ${date}. Write a brief note about the importance of patience and selective trading.`;
  const pnl = trades.reduce((a,t)=>a+(t.netPnl||0),0);
  const wins = trades.filter(t=>(t.netPnl||0)>0);
  const losses = trades.filter(t=>(t.netPnl||0)<0);
  const tradeList = trades.map(t=>
    `- ${t.ticker} ${t.side}: entry $${t.entryPrice.toFixed(2)} → exit $${t.exitPrice?.toFixed(2)||"open"} | P&L: ${fmt$(t.netPnl||0)} | Hold: ${Math.round((t.holdTimeSeconds||0)/60)}min | Tags: ${(t.tags||[]).join(",")||"none"} | Notes: ${t.notes||"none"}`
  ).join("\n");
  return `You are a professional trading coach reviewing a trader's day. Be specific, direct, and constructive.

DATE: ${date}
SUMMARY: ${trades.length} trades | ${wins.length}W ${losses.length}L | Net P&L: ${fmt$(pnl)}

TRADE LOG:
${tradeList}

Write a daily trading recap in this exact format:

## Day Summary
2-3 sentences covering the overall day — was it good execution, did the results match the process?

## What You Did Well
2-3 specific positives from today's trades. Reference actual tickers and prices.

## What Needs Work
2-3 specific areas to improve. Be honest and direct.

## Patterns I Notice
Any recurring behaviors across today's trades — good or bad. Look at hold times, tags, consecutive wins/losses.

## Tomorrow's Focus
1-2 specific, actionable things to focus on in tomorrow's session.

## Mindset Note
One sentence on the mental/emotional aspect of today's trading.`;
}

export default function DailyRecapPage() {
  const { getActiveTrades } = useAccountStore();
  const trades = getActiveTrades();
  const { isPro } = useSubscription();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0,10));
  const [status, setStatus] = useState<"idle"|"loading"|"streaming"|"done"|"error">("idle");
  const [text, setText] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const todayTrades = trades.filter(t => t.status==="CLOSED" && t.entryTime?.slice(0,10)===date) as Trade[];
  const pnl = todayTrades.reduce((a,t)=>a+(t.netPnl||0),0);
  const wins = todayTrades.filter(t=>(t.netPnl||0)>0).length;
  const losses = todayTrades.filter(t=>(t.netPnl||0)<0).length;

  useEffect(()=>{
    if(scrollRef.current) scrollRef.current.scrollTop=scrollRef.current.scrollHeight;
  },[text]);

  const generate = async () => {
    if(!isPro){ setShowUpgrade(true); return; }
    setStatus("loading"); setText(""); setErrMsg("");
    try {
      const res = await fetch("/api/analyze", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ prompt: buildRecapPrompt(todayTrades, date) }),
      });
      if(!res.ok){ const j=await res.json().catch(()=>({error:`HTTP ${res.status}`}));
        if(res.status===402){ setStatus("idle"); setShowUpgrade(true); return; }
        throw new Error(j.error||`HTTP ${res.status}`); }
      if(!res.body) throw new Error("No response body");
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
          try{ const j=JSON.parse(data); const delta=j?.choices?.[0]?.delta?.content||""; if(delta) setText(t=>t+delta); }catch{}
        }
      }
      setStatus("done");
    } catch(e){ setErrMsg(String(e)); setStatus("error"); }
  };

  if(showUpgrade) return <PricingModal onClose={()=>setShowUpgrade(false)}/>;

  const renderMd = (md:string) => md.split("\n").map((line,i)=>{
    if(line.startsWith("## ")) return <div key={i} style={{fontSize:12,fontWeight:800,color:"#d500f9",textTransform:"uppercase" as const,letterSpacing:"0.08em",marginTop:18,marginBottom:6}}>{line.slice(3)}</div>;
    if(line.startsWith("- ")||line.startsWith("• ")) return <div key={i} style={{display:"flex",gap:8,marginBottom:4}}><span style={{color:"#d500f9",flexShrink:0}}>▸</span><span style={{fontSize:13,color:"#c9d1d9",lineHeight:1.6}} dangerouslySetInnerHTML={{__html: boldOnly(line.slice(2))}}/></div>;
    if(line.trim()==="") return <div key={i} style={{height:6}}/>;
    return <p key={i} style={{fontSize:13,color:"#c9d1d9",lineHeight:1.7,marginBottom:4}} dangerouslySetInnerHTML={{__html: boldOnly(line)}}/>;
  });

  return (
    <div style={{padding:20,overflowY:"auto",height:"100%",display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap" as const,gap:10}}>
        <div>
          <h2 style={{fontSize:16,fontWeight:800,color:"#f0f6fc"}}>Daily AI Recap</h2>
          <p style={{fontSize:11,color:"#4b5563",marginTop:2}}>End-of-day analysis powered by Groq AI · Free</p>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <input type="date" value={date} onChange={e=>{ setDate(e.target.value); setStatus("idle"); setText(""); }}
            style={{height:34,padding:"0 10px",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:9,color:"#d1d5db",fontSize:12,outline:"none"}}/>
          <button onClick={generate} disabled={status==="loading"||status==="streaming"} style={{
            height:34,padding:"0 20px",borderRadius:9,border:"none",
            background:"linear-gradient(135deg,#d500f9,#9900b3)",
            color:"#fff",fontSize:12,fontWeight:800,cursor:"pointer",
            opacity:status==="loading"||status==="streaming"?0.6:1,
            boxShadow:"0 0 20px rgba(213,0,249,0.3)",
          }}>
            {status==="loading"||status==="streaming" ? "Generating..." : "✦ Generate Recap"}
          </button>
        </div>
      </div>

      {/* Day stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
        {[
          ["Trades",todayTrades.length.toString(),"#c9d1d9"],
          ["Wins",wins.toString(),"#00e676"],
          ["Losses",losses.toString(),"#ff1744"],
          ["Net P&L",pnl!==0?fmt$(pnl):"$0.00",pnl>=0?"#00e676":"#ff1744"],
        ].map(([l,v,c])=>(
          <div key={l as string} style={{background:"linear-gradient(160deg,#0f1520,#0b1017)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12,padding:"14px 16px"}}>
            <div style={{fontSize:9,color:"#4b5563",textTransform:"uppercase" as const,letterSpacing:"0.08em",marginBottom:4}}>{l}</div>
            <div style={{fontSize:22,fontWeight:900,fontFamily:"monospace",color:c as string}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Trade list */}
      {todayTrades.length > 0 && (
        <div style={{background:"linear-gradient(160deg,#0f1520,#0b1017)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:14,padding:16}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase" as const,letterSpacing:"0.08em",color:"#3d4551",marginBottom:10}}>Today's Trades</div>
          <div style={{display:"flex",flexDirection:"column" as const,gap:4}}>
            {todayTrades.map(t=>(
              <div key={t.id} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 10px",borderRadius:8,background:"rgba(255,255,255,0.02)"}}>
                <span style={{fontWeight:800,fontSize:13,fontFamily:"monospace",color:"#f0f6fc",width:60}}>{t.ticker}</span>
                <span style={{padding:"1px 7px",borderRadius:4,fontSize:10,fontWeight:700,background:t.side==="LONG"?"rgba(0,230,118,0.1)":"rgba(255,23,68,0.1)",color:t.side==="LONG"?"#00e676":"#ff1744"}}>{t.side}</span>
                <span style={{fontSize:12,fontFamily:"monospace",color:"#6b7280"}}>${t.entryPrice.toFixed(2)} → ${t.exitPrice?.toFixed(2)||"open"}</span>
                {(t.tags||[]).length>0&&<div style={{display:"flex",gap:4}}>{(t.tags||[]).slice(0,3).map(tag=><span key={tag} style={{padding:"1px 6px",borderRadius:10,fontSize:9,background:"rgba(0,229,255,0.08)",color:"#00e5ff"}}>{tag}</span>)}</div>}
                <span style={{marginLeft:"auto",fontSize:12,fontWeight:800,fontFamily:"monospace",color:(t.netPnl||0)>=0?"#00e676":"#ff1744"}}>{fmt$(t.netPnl||0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Output */}
      <div style={{background:"linear-gradient(160deg,#0f1520,#0b1017)",border:"1px solid rgba(213,0,249,0.15)",borderRadius:14,padding:20,overflowWrap:"break-word" as const,wordBreak:"break-word" as const,width:"100%",boxSizing:"border-box" as const}}>
        <div ref={scrollRef}>
        {status==="idle"&&(
          <div style={{display:"flex",flexDirection:"column" as const,alignItems:"center",justifyContent:"center",height:"100%",gap:12,padding:"40px 0"}}>
            <div style={{width:48,height:48,borderRadius:14,background:"rgba(213,0,249,0.1)",border:"1px solid rgba(213,0,249,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>✦</div>
            <div style={{fontSize:13,color:"#4b5563",textAlign:"center" as const}}>
              {todayTrades.length===0?"No trades found for this date. Change the date above or import trades first.":"Click Generate Recap to get your AI-powered end-of-day analysis."}
            </div>
          </div>
        )}
        {status==="loading"&&(
          <div style={{display:"flex",flexDirection:"column" as const,alignItems:"center",justifyContent:"center",height:"100%",gap:14,padding:"40px 0"}}>
            <div style={{width:36,height:36,borderRadius:"50%",border:"2px solid rgba(213,0,249,0.15)",borderTop:"2px solid #d500f9",animation:"spin 0.8s linear infinite"}}/>
            <span style={{fontSize:13,color:"#4b5563"}}>Analyzing your trading day...</span>
          </div>
        )}
        {(status==="streaming"||status==="done")&&<div>{renderMd(text)}{status==="streaming"&&<span style={{display:"inline-block",width:2,height:14,background:"#d500f9",marginLeft:2,animation:"blink 0.8s infinite",verticalAlign:"middle"}}/>}</div>}
        {status==="error"&&errMsg.includes("Daily AI limit")&&(
          <AiLimitGate onClose={()=>setStatus("idle")} />
        )}

        {status==="error"&&!errMsg.includes("Daily AI limit")&&(
          <div style={{textAlign:"center" as const,padding:"32px 0"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#ff1744",marginBottom:8}}>Generation failed</div>
            <pre style={{fontSize:11,color:"#4b5563",whiteSpace:"pre-wrap" as const,textAlign:"left" as const,maxWidth:400,margin:"0 auto"}}>{errMsg}</pre>
            <button onClick={generate} style={{marginTop:16,height:32,padding:"0 18px",borderRadius:8,background:"rgba(213,0,249,0.1)",border:"1px solid rgba(213,0,249,0.3)",color:"#d500f9",fontSize:12,fontWeight:700,cursor:"pointer"}}>Retry</button>
          </div>
        )}
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
    </div>
  );
}

const PROMPTS = [
  "What was your best trade today and why did you take it?",
  "Did you follow your trading rules on every trade?",
  "What emotion did you feel most strongly during trading today?",
  "Was there a trade you hesitated on? What held you back?",
  "If you could redo one trade today, which would it be and why?",
  "Did you stick to your position sizing rules?",
  "What market conditions affected your performance today?",
  "Were you patient or did you force trades?",
  "What's one thing you'll do differently tomorrow?",
  "Rate your discipline today from 1-10 and explain why.",
];

function JournalPrompts({ trades }: { trades: import("@/types/trade").Trade[] }) {
  const [answers, setAnswers] = useState<Record<number,string>>({});
  const [saved, setSaved] = useState(false);
  const today = new Date().toISOString().slice(0,10);
  const prompts = PROMPTS.slice(0, trades.length > 0 ? 4 : 2);

  useEffect(() => {
    try { const s = localStorage.getItem(scopedKey(`th_journal_prompts_${today}`)); if (s) setAnswers(JSON.parse(s)); } catch {}
  }, [today]);

  const save = () => {
    localStorage.setItem(scopedKey(`th_journal_prompts_${today}`), JSON.stringify(answers));
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ background:"linear-gradient(160deg,#0f1520,#0b1017)", border:"1px solid rgba(255,171,0,0.15)", borderRadius:14, padding:18, marginTop:4 }}>
      <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.08em", color:"#ffab00", marginBottom:14 }}>📝 Journal Prompts</div>
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {prompts.map((p, i) => (
          <div key={i}>
            <div style={{ fontSize:12, color:"#c9d1d9", marginBottom:5, lineHeight:1.5 }}>{p}</div>
            <textarea value={answers[i]||""} onChange={e=>setAnswers(a=>({...a,[i]:e.target.value}))}
              placeholder="Write your reflection..." rows={2}
              style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:9, color:"#d1d5db", fontSize:12, padding:"8px 12px", outline:"none", fontFamily:"inherit", resize:"vertical" as const, boxSizing:"border-box" as const }}/>
          </div>
        ))}
        <button onClick={save} style={{ height:34, borderRadius:9, border:`1px solid ${saved ? "rgba(0,230,118,0.3)" : "rgba(255,171,0,0.2)"}`, background: saved ? "rgba(0,230,118,0.2)" : "rgba(255,171,0,0.1)", color: saved ? "#00e676" : "#ffab00", fontSize:12, fontWeight:700, cursor:"pointer" }}>
          {saved ? "✓ Saved" : "Save Reflections"}
        </button>
      </div>
    </div>
  );
}
