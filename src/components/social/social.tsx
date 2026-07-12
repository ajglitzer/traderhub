"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { createClient } from "@/lib/supabase";
import {
  Profile, Message, FriendRequest, Battle, BattleTrade,
  getFriends, getFriendRequests, sendFriendRequest, respondToFriendRequest,
  unfriendUser, blockUser, unblockUser, getBlockedUsers,
  getConversations, getMessages, sendMessage, markMessagesRead, getUnreadCount,
  getBattles, sendBattleRequest, respondToBattle, submitBattleTrades, finalizeBattle,
  searchProfiles, getMyProfile,
} from "@/lib/social";
import { useAccountStore } from "@/store/accounts";
import { useStore } from "@/store";

const fmt$ = (n:number) => (n>=0?"+":"")+`$${Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

// -- Avatar --------------------------------------------------------------------
function Avatar({ profile, size=32 }: { profile: Profile; size?: number }) {
  const initial = (profile.display_name || profile.username)[0].toUpperCase();
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", background:profile.avatar_color+"22", border:`2px solid ${profile.avatar_color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.4, fontWeight:800, color:profile.avatar_color, flexShrink:0 }}>
      {initial}
    </div>
  );
}

// -- Battle simulator - 5 simulated trades -------------------------------------
function BattleSimulator({ battle, myId, onSubmit }: { battle: Battle; myId: string; onSubmit: (trades: BattleTrade[]) => void }) {
  const isChallenger = myId === battle.challenger_id;
  const myTrades = isChallenger ? battle.challenger_trades : battle.opponent_trades;

  // Mini sim state
  type Candle = {o:number;h:number;l:number;c:number};
  const [candles, setCandles] = useState<Candle[]>([]);
  const [simTrades, setSimTrades] = useState<BattleTrade[]>([]);
  const [inTrade, setInTrade] = useState(false);
  const [entry, setEntry] = useState(0);
  const [side, setSide] = useState<"LONG"|"SHORT">("LONG");
  const [tp, setTp] = useState("20");
  const [sl, setSl] = useState("10");
  const [curIdx, setCurIdx] = useState(50);
  const [playing, setPlaying] = useState(false);
  const tickRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Symbol base prices
  const bases: Record<string,number> = { NQ:20000, ES:5000, MGC:2500, CL:80 };
  const base = bases[battle.symbol] || 100;

  // Generate realistic candles on mount
  useEffect(() => {
    const c: Candle[] = [];
    let p = base;
    let trend = 0, vol = 1.0;
    for (let i = 0; i < 300; i++) {
      if(Math.random()<0.06) vol = 0.5+Math.random()*2.5;
      else vol = vol*0.97+(0.5+Math.random()*1.5)*0.03;
      if(Math.random()<0.04) trend=(Math.random()-0.5)*0.8;
      else trend*=0.95;
      const v = base*0.0015*vol;
      const o=p, move=(Math.random()-0.48+trend*0.1)*v;
      const cl=+(p+move).toFixed(2);
      const uW=Math.random()*v*0.5, lW=Math.random()*v*0.5;
      c.push({ o, h:+(Math.max(o,cl)+uW).toFixed(2), l:+(Math.min(o,cl)-lW).toFixed(2), c:cl });
      p=+(cl).toFixed(2);
    }
    setCandles(c);
  }, [base]);

  // Draw canvas
  useEffect(() => {
    const cv = canvasRef.current; if(!cv||!candles.length) return;
    const dpr=window.devicePixelRatio||1, W=cv.offsetWidth, H=cv.offsetHeight;
    cv.width=W*dpr; cv.height=H*dpr;
    const ctx=cv.getContext("2d")!; ctx.scale(dpr,dpr);
    ctx.fillStyle="#060a0f"; ctx.fillRect(0,0,W,H);
    const slice=candles.slice(Math.max(0,curIdx-60),curIdx);
    if(!slice.length) return;
    const lo=Math.min(...slice.map(c=>c.l)),hi=Math.max(...slice.map(c=>c.h));
    const pad=(hi-lo)*0.1||1;
    const toX=(i:number)=>12+(i/(slice.length-1||1))*(W-24);
    const toY=(p:number)=>8+(H-16)-(p-lo+pad)/((hi-lo+pad*2))*(H-16);
    const bW=Math.max(2,Math.min(10,(W-24)/slice.length*0.7));
    slice.forEach((c,i)=>{
      const g=c.c>=c.o;
      ctx.strokeStyle=g?"rgba(0,230,118,0.6)":"rgba(255,23,68,0.6)"; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(toX(i),toY(c.h)); ctx.lineTo(toX(i),toY(c.l)); ctx.stroke();
      ctx.fillStyle=g?"#00e676":"#ff1744"; ctx.globalAlpha=0.85;
      ctx.fillRect(toX(i)-bW/2,toY(Math.max(c.o,c.c)),bW,Math.max(1.5,toY(Math.min(c.o,c.c))-toY(Math.max(c.o,c.c))));
      ctx.globalAlpha=1;
    });
    if(inTrade&&entry){
      const entryY=toY(entry);
      const tpPrice=side==="LONG"?entry+(+tp):entry-(+tp);
      const slPrice=side==="LONG"?entry-(+sl):entry+(+sl);
      [[entry,"#00e5ff","Entry"],[tpPrice,"#00e676","TP"],[slPrice,"#ff1744","SL"]].forEach(([p,col,lbl])=>{
        const y=toY(p as number);
        ctx.strokeStyle=col as string; ctx.lineWidth=lbl==="Entry"?2:1.5;
        ctx.setLineDash(lbl==="Entry"?[]:[6,4]);
        ctx.beginPath(); ctx.moveTo(12,y); ctx.lineTo(W-12,y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle=col as string; ctx.font="bold 9px Inter"; ctx.textAlign="left";
        ctx.fillText(lbl as string,14,y-3);
      });
    }
  },[candles,curIdx,inTrade,entry,side,tp,sl]);

  // Timer
  useEffect(()=>{
    if(tickRef.current) clearInterval(tickRef.current);
    if(!playing) return;
    tickRef.current=setInterval(()=>{
      setCurIdx(v=>{
        if(v>=candles.length){setPlaying(false);return candles.length;}
        // Check TP/SL if in trade
        if(inTrade&&candles[v]){
          const c=candles[v];
          const tpP=side==="LONG"?entry+(+tp):entry-(+tp);
          const slP=side==="LONG"?entry-(+sl):entry+(+sl);
          // Point value per contract
          const sym=(battle.symbol||"NQ").toUpperCase();
          const ptVal=sym.includes("MNQ")?2:sym.includes("MES")?5:sym.includes("NQ")?20:sym.includes("ES")?50:sym.includes("YM")?5:1;
          if((side==="LONG"&&c.h>=tpP)||(side==="SHORT"&&c.l<=tpP)){
            const pnl=+(+tp*ptVal).toFixed(2);
            setSimTrades(prev=>[...prev,{side,entry,exit:tpP,pnl,pct:pnl/entry*100}]);
            setInTrade(false);
          } else if((side==="LONG"&&c.l<=slP)||(side==="SHORT"&&c.h>=slP)){
            const pnl=+(-(+sl)*ptVal).toFixed(2);
            setSimTrades(prev=>[...prev,{side,entry,exit:slP,pnl,pct:pnl/entry*100}]);
            setInTrade(false);
          }
        }
        return v+1;
      });
    },200);
    return()=>{if(tickRef.current)clearInterval(tickRef.current);};
  },[playing,candles,inTrade,entry,side,tp,sl]);

  const curPrice = candles[curIdx-1]?.c || base;
  const totalPnl = simTrades.reduce((a,t)=>a+t.pnl,0);
  const done = myTrades !== null;

  if (done) return (
    <div style={{textAlign:"center",padding:24,color:"#4b5563"}}>
      <div style={{fontSize:14,fontWeight:700,color:"#00e676",marginBottom:4}}>✓ Trades submitted!</div>
      <div style={{fontSize:12}}>Score: {fmt$(myTrades?.reduce((a,t)=>a+t.pnl,0)||0)}</div>
      <div style={{fontSize:11,marginTop:8}}>Waiting for opponent...</div>
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <div style={{fontSize:11,color:"#4b5563",textAlign:"center"}}>
        Battle on <strong style={{color:"#f0f6fc"}}>{battle.symbol}</strong> · Trade {simTrades.length}/5
        {simTrades.length>=5&&<span style={{color:"#ffab00"}}> — Submit when ready</span>}
      </div>

      <canvas ref={canvasRef} style={{width:"100%",height:160,display:"block",borderRadius:8}}/>

      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        <button onClick={()=>setPlaying(p=>!p)} style={{height:30,width:30,borderRadius:8,border:"1px solid rgba(0,229,255,0.3)",background:"rgba(0,229,255,0.08)",color:"#00e5ff",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>
          {playing?"⏸":"▶"}
        </button>
        <div style={{fontSize:12,fontFamily:"monospace",color:"#f0f6fc",fontWeight:700}}>{curPrice.toFixed(2)}</div>
        <div style={{display:"flex",gap:4,alignItems:"center",marginLeft:4}}>
          <span style={{fontSize:10,color:"#4b5563"}}>TP</span>
          <input value={tp} onChange={e=>setTp(e.target.value)} type="number" style={{width:52,height:26,padding:"0 6px",background:"rgba(0,230,118,0.06)",border:"1px solid rgba(0,230,118,0.2)",borderRadius:6,color:"#00e676",fontSize:12,textAlign:"center",outline:"none"}}/>
          <span style={{fontSize:10,color:"#4b5563"}}>SL</span>
          <input value={sl} onChange={e=>setSl(e.target.value)} type="number" style={{width:52,height:26,padding:"0 6px",background:"rgba(255,23,68,0.06)",border:"1px solid rgba(255,23,68,0.2)",borderRadius:6,color:"#ff1744",fontSize:12,textAlign:"center",outline:"none"}}/>
        </div>
        {!inTrade&&simTrades.length<5&&<>
          <button onClick={()=>{if(!candles.length)return;setSide("LONG");setEntry(curPrice);setInTrade(true);}} disabled={!candles.length} style={{height:28,padding:"0 12px",borderRadius:8,border:"none",background:candles.length?"#00e676":"rgba(0,230,118,0.2)",color:candles.length?"#000":"#374151",cursor:candles.length?"pointer":"default",fontSize:11,fontWeight:800}}>▲ LONG</button>
          <button onClick={()=>{if(!candles.length)return;setSide("SHORT");setEntry(curPrice);setInTrade(true);}} disabled={!candles.length} style={{height:28,padding:"0 12px",borderRadius:8,border:"none",background:candles.length?"#ff1744":"rgba(255,23,68,0.2)",color:candles.length?"#fff":"#374151",cursor:candles.length?"pointer":"default",fontSize:11,fontWeight:800}}>▼ SHORT</button>
        </>}
        {inTrade&&<div style={{fontSize:11,color:"#ffab00"}}>In trade...</div>}
        <div style={{marginLeft:"auto",fontSize:12,fontWeight:700,fontFamily:"monospace",color:totalPnl>=0?"#00e676":"#ff1744"}}>{fmt$(totalPnl)}</div>
      </div>

      {/* Trade history */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {simTrades.map((t,i)=>(
          <div key={i} style={{padding:"3px 10px",borderRadius:6,fontSize:11,fontWeight:700,background:t.pnl>=0?"rgba(0,230,118,0.1)":"rgba(255,23,68,0.1)",color:t.pnl>=0?"#00e676":"#ff1744"}}>
            {t.side} {t.pnl>=0?"+":""}{t.pnl.toFixed(1)}
          </div>
        ))}
      </div>

      {simTrades.length>=5&&(
        <button onClick={()=>onSubmit(simTrades)} style={{height:36,borderRadius:10,border:"none",background:"linear-gradient(135deg,#00e5ff,#0088bb)",color:"#000",fontSize:13,fontWeight:800,cursor:"pointer",boxShadow:"0 0 16px rgba(0,229,255,0.2)"}}>
          Submit {simTrades.length} Trades — Score: {fmt$(totalPnl)}
        </button>
      )}
    </div>
  );
}

// -- Main Social Hub -----------------------------------------------------------
export default function SocialPage({ myProfile }: { myProfile: Profile }) {
  const hasSupabase = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://placeholder.supabase.co");
  if (!hasSupabase) return (
    <div style={{display:"flex",flexDirection:"column" as const,alignItems:"center",justifyContent:"center",height:"100%",gap:16,padding:40}}>
      <div style={{fontSize:36}}>🔌</div>
      <div style={{fontSize:16,fontWeight:800,color:"#f0f6fc"}}>Supabase not configured</div>
      <div style={{fontSize:13,color:"#4b5563",textAlign:"center" as const,maxWidth:420,lineHeight:1.7}}>
        The Community tab requires Supabase for real-time messaging and battles.<br/>
        Add your <strong style={{color:"#00e5ff"}}>NEXT_PUBLIC_SUPABASE_URL</strong> and <strong style={{color:"#00e5ff"}}>NEXT_PUBLIC_SUPABASE_ANON_KEY</strong> to your <strong style={{color:"#c9d1d9"}}>.env</strong> file then restart the server.
      </div>
      <a href="https://supabase.com/dashboard/project/_/settings/api" target="_blank" rel="noreferrer" style={{padding:"10px 20px",borderRadius:10,background:"rgba(0,229,255,0.1)",border:"1px solid rgba(0,229,255,0.25)",color:"#00e5ff",fontSize:13,fontWeight:700,textDecoration:"none"}}>
        Get Supabase Keys ↗
      </a>
    </div>
  );
  const { user } = useAuth();
  const { getActiveTrades } = useAccountStore();
  const { setCommunityBadge, activeTab } = useStore();
  const trades = getActiveTrades();

  const [tab, setTab] = useState<"messages"|"friends"|"battles">("messages");
  const [confirmAction, setConfirmAction] = useState<{type:"unfriend"|"block",friend:Profile}|null>(null);
  const [isMob, setIsMob] = useState(()=>typeof window!=="undefined"&&window.innerWidth<768);
  useEffect(()=>{ const h=()=>setIsMob(window.innerWidth<768); window.addEventListener("resize",h); return ()=>window.removeEventListener("resize",h); },[]);
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [blockedProfiles, setBlockedProfiles] = useState<Profile[]>([]);
  const [showBlocked, setShowBlocked] = useState(false);
  const [friendMenu, setFriendMenu] = useState<string|null>(null);
  const [friendActionTarget, setFriendActionTarget] = useState<Profile|null>(null);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [convos, setConvos] = useState<{profile:Profile;lastMessage:Message;unread:number}[]>([]);
  const [battles, setBattles] = useState<Battle[]>([]);
  const [chatWith, setChatWith] = useState<Profile|null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgInput, setMsgInput] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchRes, setSearchRes] = useState<Profile[]>([]);
  const [activeBattle, setActiveBattle] = useState<Battle|null>(null);
  const [unread, setUnread] = useState(0);
  const msgEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const load = useCallback(async()=>{
    if(!user) return;
    const [f,r,c,b,u] = await Promise.all([
      getFriends(user.id), getFriendRequests(user.id),
      getConversations(user.id), getBattles(user.id),
      getUnreadCount(user.id),
    ]);
    setFriends(f); setRequests(r); setConvos(c); setBattles(b); setUnread(u);
    if(user) { const bids = await getBlockedUsers(user.id); setBlockedIds(bids); const bprofs = await Promise.all(bids.map(async(bid:string)=>{ try{ const r=await supabase.from("profiles").select("*").eq("id",bid).single(); return r.data; }catch{ return null; } })); setBlockedProfiles(bprofs.filter(Boolean) as Profile[]); }
    // Update sidebar badge when not on community tab
    const pendingR = r.filter((req:FriendRequest)=>req.to_id===user.id&&req.status==="pending");
    const total = u + pendingR.length;
    setCommunityBadge(total);
  },[user, setCommunityBadge]);

  // Clear badge when user opens community tab
  useEffect(()=>{ if(activeTab==="social") setCommunityBadge(0); },[activeTab, setCommunityBadge]);

  useEffect(()=>{ load(); },[load]);

  // Realtime messages
  useEffect(()=>{
    if(!user) return;
    const ch = supabase.channel("messages").on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},()=>{
      load();
      if(chatWith) loadMessages(chatWith.id);
    }).subscribe();
    return()=>{ supabase.removeChannel(ch); };
  },[user,chatWith]);

  const loadMessages = async(otherId:string)=>{
    if(!user) return;
    const msgs = await getMessages(user.id, otherId);
    setMessages(msgs);
    await markMessagesRead(user.id, otherId);
    setTimeout(()=>msgEndRef.current?.scrollIntoView({behavior:"smooth"}),100);
  };

  const openChat = (profile:Profile)=>{ setChatWith(profile); loadMessages(profile.id); };

  const send = async()=>{
    if(!msgInput.trim()||!chatWith||!user) return;
    await sendMessage(user.id, chatWith.id, msgInput.trim());
    setMsgInput(""); loadMessages(chatWith.id);
  };

  const shareLastTrade = async()=>{
    if(!chatWith||!user) return;
    const t = [...trades].filter(x=>x.status==="CLOSED").sort((a,b)=>new Date(b.entryTime).getTime()-new Date(a.entryTime).getTime())[0];
    if(!t) return;
    await sendMessage(user.id, chatWith.id, `📊 Trade Share: ${t.ticker} ${t.side} — ${fmt$(t.netPnl||0)}`, "trade_share", { ticker:t.ticker, side:t.side, entryPrice:t.entryPrice, exitPrice:t.exitPrice, netPnl:t.netPnl, entryTime:t.entryTime, exitTime:t.exitTime });
    loadMessages(chatWith.id);
  };

  const doSearch = async()=>{
    if(!searchQ.trim()) return;
    try {
      // Try Supabase first
      const r = await searchProfiles(searchQ);
      const filtered = r.filter(p=>p.id!==user?.id);
      if (filtered.length > 0) { setSearchRes(filtered); return; }
    } catch {}
    // Fall back to local registry
    try {
      const registry = JSON.parse(localStorage.getItem("th_registry") || "{}");
      const q = searchQ.toLowerCase().trim();
      const results = Object.values(registry as Record<string,any>)
        .filter((p:any) => p.username.includes(q) && p.id !== user?.id)
        .slice(0,10) as any[];
      setSearchRes(results);
    } catch { setSearchRes([]); }
  };

  const addFriend = async(toId:string)=>{ if(!user) return; await sendFriendRequest(user.id, toId); setSearchRes([]); setSearchQ(""); load(); };
  const handleUnfriend = async(fid:string)=>{ if(!user) return; await unfriendUser(user.id,fid); setConfirmAction(null); load(); };
  const handleUnblock = async(fid:string)=>{ if(!user) return; await unblockUser(user.id,fid); load(); };
  const handleBlock = async(fid:string)=>{ if(!user) return; await blockUser(user.id,fid); setConfirmAction(null); load(); };

  const respondReq = async(id:string,status:"accepted"|"declined")=>{ await respondToFriendRequest(id,status); load(); };

  const startBattle = async(opponentId:string,symbol:string)=>{
    if(!user) return;
    // Only allow one pending/active battle at a time
    const activeBattles = battles.filter(b=>(b.status==="active"||b.status==="pending")&&(b.challenger_id===user.id||b.opponent_id===user.id));
    if(activeBattles.length>0){ alert("You already have an active battle. Finish it before starting a new one."); return; }
    const id = await sendBattleRequest(user.id, opponentId, symbol);
    await sendMessage(user.id, opponentId, `⚔️ Battle challenge! Join me for a ${symbol} trading battle — 5 trades each.`, "battle_request", { battle_id: id });
    load();
  };

  const pendingRequests = requests.filter(r=>r.to_id===user?.id&&r.status==="pending");
  const myBattles = battles.filter(b=>b.status==="active"&&(b.challenger_id===user?.id||b.opponent_id===user?.id));

  const TABS = [
    {id:"messages" as const, label:"Messages", badge:unread},
    {id:"friends"  as const, label:"Friends",  badge:pendingRequests.length},
    {id:"battles"  as const, label:"Battles",  badge:myBattles.length},
  ];

  return (
    <>
    <div style={{display:"flex",height:"100%",overflow:"hidden",position:"relative"}}>

      {/* Left panel */}
      <div style={{width:isMob?(chatWith?0:"100%"):280,minWidth:isMob?(chatWith?0:"100%"):280,borderRight:"1px solid rgba(255,255,255,0.06)",display:chatWith&&isMob?"none":"flex",flexDirection:"column",background:"rgba(0,0,0,0.15)",flexShrink:0,overflow:"hidden"}}>
        {/* My profile */}
        <div style={{padding:"14px 16px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",gap:10}}>
          <Avatar profile={myProfile} size={36}/>
          <div>
            <div style={{fontSize:13,fontWeight:800,color:"#f0f6fc"}}>@{myProfile.username}</div>
            <div style={{fontSize:10,color:"#4b5563"}}>{myProfile.display_name}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",padding:"8px 10px",gap:4,borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,height:30,borderRadius:8,border:"1px solid",borderColor:tab===t.id?"rgba(0,229,255,0.4)":"rgba(255,255,255,0.07)",background:tab===t.id?"rgba(0,229,255,0.1)":"transparent",color:tab===t.id?"#00e5ff":"#6b7280",fontSize:11,fontWeight:700,cursor:"pointer",position:"relative"}}>
              {t.label}
              {t.badge>0&&<span style={{position:"absolute",top:-4,right:-4,width:16,height:16,borderRadius:"50%",background:"#ff1744",fontSize:9,fontWeight:800,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>{t.badge}</span>}
            </button>
          ))}
        </div>

        {/* Messages tab */}
        {tab==="messages"&&(
          <div style={{flex:1,overflowY:"auto"}}>
            {convos.length===0&&<div style={{padding:20,fontSize:12,color:"#374151",textAlign:"center"}}>No conversations yet.<br/>Add friends to start chatting.</div>}
            {convos.map(conv=>(
              <div key={conv.profile.id} onClick={()=>openChat(conv.profile)} style={{
                display:"flex",alignItems:"center",gap:10,padding:"10px 14px",cursor:"pointer",
                background:chatWith?.id===conv.profile.id?"rgba(0,229,255,0.06)":"transparent",
                borderBottom:"1px solid rgba(255,255,255,0.04)",
              }}>
                <Avatar profile={conv.profile} size={34}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#f0f6fc"}}>@{conv.profile.username}</div>
                  <div style={{fontSize:11,color:"#4b5563",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{conv.lastMessage.content.slice(0,40)}</div>
                </div>
                {conv.unread>0&&<span style={{width:18,height:18,borderRadius:"50%",background:"#00e5ff",fontSize:10,fontWeight:800,color:"#000",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{conv.unread}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Friends tab */}
        {tab==="friends"&&(
          <div style={{flex:1,overflowY:"auto",padding:12,display:"flex",flexDirection:"column",gap:10}}>
            {/* Search */}
            <div style={{display:"flex",gap:6}}>
              <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doSearch()}
                placeholder="Search by username..." style={{flex:1,height:32,padding:"0 10px",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:8,color:"#d1d5db",fontSize:12,outline:"none"}}/>
              <button onClick={doSearch} style={{height:32,padding:"0 10px",borderRadius:8,background:"rgba(0,229,255,0.1)",border:"1px solid rgba(0,229,255,0.2)",color:"#00e5ff",cursor:"pointer",fontSize:12,fontWeight:700}}>Find</button>
            </div>
            {searchRes.map(p=>(
              <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:"rgba(255,255,255,0.03)",borderRadius:9,border:"1px solid rgba(255,255,255,0.06)"}}>
                <Avatar profile={p} size={28}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#f0f6fc"}}>@{p.username}</div>
                </div>
                <button onClick={()=>addFriend(p.id)} style={{height:26,padding:"0 10px",borderRadius:7,background:"rgba(0,229,255,0.1)",border:"1px solid rgba(0,229,255,0.2)",color:"#00e5ff",cursor:"pointer",fontSize:11,fontWeight:700}}>+ Add</button>
              </div>
            ))}

            {/* Pending requests */}
            {pendingRequests.length>0&&(
              <>
                <div style={{fontSize:9,color:"#4b5563",textTransform:"uppercase",letterSpacing:"0.08em",marginTop:4}}>Friend Requests</div>
                {pendingRequests.map(req=>(
                  <div key={req.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:"rgba(255,171,0,0.06)",borderRadius:9,border:"1px solid rgba(255,171,0,0.15)"}}>
                    <Avatar profile={req.from_profile!} size={28}/>
                    <div style={{flex:1,fontSize:12,color:"#c9d1d9"}}>@{req.from_profile?.username}</div>
                    <button onClick={()=>respondReq(req.id,"accepted")} style={{height:26,padding:"0 8px",borderRadius:7,background:"rgba(0,230,118,0.1)",border:"1px solid rgba(0,230,118,0.2)",color:"#00e676",cursor:"pointer",fontSize:11,fontWeight:700}}>✓</button>
                    <button onClick={()=>respondReq(req.id,"declined")} style={{height:26,padding:"0 8px",borderRadius:7,background:"rgba(255,23,68,0.08)",border:"1px solid rgba(255,23,68,0.15)",color:"#f87171",cursor:"pointer",fontSize:11,fontWeight:700}}>✕</button>
                  </div>
                ))}
              </>
            )}

            {/* Blocked users section */}
            {blockedIds.length > 0 && (
              <div style={{marginTop:8}}>
                <button onClick={()=>setShowBlocked(p=>!p)} style={{display:"flex",alignItems:"center",gap:6,fontSize:9,color:"#4b5563",textTransform:"uppercase",letterSpacing:"0.08em",background:"none",border:"none",cursor:"pointer",padding:0,marginBottom:6}}>
                  <span>{showBlocked?"▾":"▸"}</span> Blocked Users ({blockedIds.length})
                </button>
                {showBlocked && blockedProfiles.map(b=>(
                  <div key={b.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:"rgba(255,23,68,0.04)",borderRadius:9,border:"1px solid rgba(255,23,68,0.1)",marginBottom:4}}>
                    <Avatar profile={b} size={26}/>
                    <div style={{flex:1,fontSize:11,color:"#6b7280"}}>@{b.username}</div>
                    <button onClick={()=>handleUnblock(b.id)} style={{height:24,padding:"0 10px",borderRadius:6,border:"1px solid rgba(0,229,255,0.2)",background:"rgba(0,229,255,0.06)",color:"#00e5ff",cursor:"pointer",fontSize:10,fontWeight:700}}>Unblock</button>
                  </div>
                ))}
              </div>
            )}

            {/* Friends list */}
            <div style={{fontSize:9,color:"#4b5563",textTransform:"uppercase",letterSpacing:"0.08em",marginTop:4}}>Friends ({friends.length})</div>
            {friends.map(f=>(
              <div key={f.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:"rgba(255,255,255,0.02)",borderRadius:9,border:"1px solid rgba(255,255,255,0.05)",position:"relative"}}>
                <Avatar profile={f} size={28}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#f0f6fc"}}>@{f.username}</div>
                </div>
                <button onClick={()=>openChat(f)} style={{height:26,padding:"0 8px",borderRadius:7,background:"rgba(0,229,255,0.08)",border:"1px solid rgba(0,229,255,0.15)",color:"#00e5ff",cursor:"pointer",fontSize:11}}>Chat</button>
                <button onClick={()=>startBattle(f.id,prompt("Symbol (NQ/ES/MGC)?","NQ")||"NQ")} style={{height:26,padding:"0 8px",borderRadius:7,background:"rgba(213,0,249,0.08)",border:"1px solid rgba(213,0,249,0.2)",color:"#d500f9",cursor:"pointer",fontSize:11}}>⚔️</button>
                <button onClick={()=>setFriendActionTarget(f)} style={{height:26,width:26,borderRadius:7,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",color:"#9ca3af",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>⋯</button>
              </div>
            ))}
          </div>
        )}

        {/* Battles tab */}
        {tab==="battles"&&(
          <div style={{flex:1,overflowY:"auto",padding:12,display:"flex",flexDirection:"column",gap:8}}>
            {battles.length===0&&<div style={{fontSize:12,color:"#374151",textAlign:"center",padding:20}}>No battles yet.<br/>Challenge a friend from the Friends tab.</div>}
            {battles.map(b=>{
              const isChallenger=b.challenger_id===user?.id;
              const opponent=isChallenger?b.opponent_profile:b.challenger_profile;
              const myScore=isChallenger?b.challenger_score:b.opponent_score;
              const theirScore=isChallenger?b.opponent_score:b.challenger_score;
              const iWon=b.winner_id===user?.id;
              return (
                <div key={b.id} style={{padding:"10px 12px",background:"rgba(255,255,255,0.02)",borderRadius:10,border:`1px solid ${b.status==="active"?"rgba(213,0,249,0.2)":b.status==="completed"?iWon?"rgba(0,230,118,0.2)":"rgba(255,23,68,0.2)":"rgba(255,255,255,0.06)"}`,cursor:"pointer"}} onClick={()=>setActiveBattle(b)}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <span style={{fontSize:14}}>⚔️</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:700,color:"#f0f6fc"}}>vs @{opponent?.username}</div>
                      <div style={{fontSize:10,color:"#4b5563"}}>{b.symbol} · {b.status}</div>
                    </div>
                    {b.status==="pending"&&!isChallenger&&(
                      <div style={{display:"flex",gap:4}}>
                        <button onClick={e=>{e.stopPropagation();respondToBattle(b.id, true).then(load);}} style={{height:24,padding:"0 8px",borderRadius:6,background:"rgba(0,230,118,0.1)",border:"1px solid rgba(0,230,118,0.2)",color:"#00e676",cursor:"pointer",fontSize:10,fontWeight:700}}>Accept</button>
                        <button onClick={e=>{e.stopPropagation();respondToBattle(b.id,false).then(load);}} style={{height:24,padding:"0 8px",borderRadius:6,background:"rgba(255,23,68,0.08)",border:"1px solid rgba(255,23,68,0.15)",color:"#f87171",cursor:"pointer",fontSize:10}}>Decline</button>
                      </div>
                    )}
                  </div>
                  {b.status==="completed"&&(
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                      <span style={{color:iWon?"#00e676":"#ff1744",fontWeight:800}}>{iWon?"🏆 You won!":"💀 You lost"}</span>
                      <span style={{fontFamily:"monospace",color:"#6b7280"}}>{fmt$(myScore||0)} vs {fmt$(theirScore||0)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right panel - chat or battle */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
        {activeBattle&&(
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",gap:10,background:"rgba(0,0,0,0.2)"}}>
              <span style={{fontSize:16}}>⚔️</span>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:800,color:"#f0f6fc"}}>Battle vs @{activeBattle.challenger_id===user?.id?activeBattle.opponent_profile?.username:activeBattle.challenger_profile?.username}</div>
                <div style={{fontSize:10,color:"#4b5563"}}>{activeBattle.symbol} · 5 trades each · Most P&L wins</div>
              </div>
              <button onClick={()=>setActiveBattle(null)} style={{width:28,height:28,borderRadius:8,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",color:"#4b5563",cursor:"pointer",fontSize:17,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:16}}>
              {activeBattle.status==="active"&&(
                <BattleSimulator battle={activeBattle} myId={user?.id||""} onSubmit={async(t)=>{
                  await submitBattleTrades(activeBattle.id,user?.id||"",activeBattle.challenger_id,t);
                  // Check if both submitted
                  const updated=await getBattles(user?.id||"");
                  const b=updated.find(x=>x.id===activeBattle.id);
                  if(b&&b.challenger_trades&&b.opponent_trades) await finalizeBattle(b);
                  load(); setActiveBattle(null);
                }}/>
              )}
              {activeBattle.status==="completed"&&(
                <div style={{textAlign:"center",padding:32}}>
                  <div style={{fontSize:32,marginBottom:12}}>{activeBattle.winner_id===user?.id?"🏆":"💀"}</div>
                  <div style={{fontSize:18,fontWeight:800,color:activeBattle.winner_id===user?.id?"#00e676":"#ff1744",marginBottom:8}}>
                    {activeBattle.winner_id===user?.id?"You won the battle!":"You lost the battle"}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginTop:16,maxWidth:300,margin:"0 auto"}}>
                    <div style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:14}}>
                      <div style={{fontSize:10,color:"#4b5563",marginBottom:4}}>Your score</div>
                      <div style={{fontSize:22,fontWeight:900,fontFamily:"monospace",color:activeBattle.challenger_id===user?.id?(activeBattle.challenger_score||0)>=0?"#00e676":"#ff1744":(activeBattle.opponent_score||0)>=0?"#00e676":"#ff1744"}}>
                        {fmt$(activeBattle.challenger_id===user?.id?activeBattle.challenger_score||0:activeBattle.opponent_score||0)}
                      </div>
                    </div>
                    <div style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:14}}>
                      <div style={{fontSize:10,color:"#4b5563",marginBottom:4}}>Their score</div>
                      <div style={{fontSize:22,fontWeight:900,fontFamily:"monospace",color:"#6b7280"}}>
                        {fmt$(activeBattle.challenger_id===user?.id?activeBattle.opponent_score||0:activeBattle.challenger_score||0)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {activeBattle.status==="pending"&&(
                <div style={{textAlign:"center",padding:32,color:"#4b5563"}}>
                  <div style={{fontSize:28,marginBottom:12}}>⏳</div>
                  <div style={{fontSize:13}}>Waiting for opponent to accept...</div>
                </div>
              )}
            </div>
          </div>
        )}

        {!activeBattle&&chatWith&&(
          <>
            <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",gap:10,background:"rgba(0,0,0,0.2)"}}>
              <Avatar profile={chatWith} size={32}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:800,color:"#f0f6fc"}}>@{chatWith.username}</div>
                <div style={{fontSize:10,color:"#4b5563"}}>{chatWith.display_name}</div>
              </div>
              <button onClick={shareLastTrade} title="Share your last trade" style={{height:28,padding:"0 10px",borderRadius:8,background:"rgba(0,229,255,0.08)",border:"1px solid rgba(0,229,255,0.15)",color:"#00e5ff",cursor:"pointer",fontSize:11,fontWeight:700}}>📊 Share Trade</button>
              <button onClick={()=>startBattle(chatWith.id,prompt("Symbol (NQ/ES/MGC)?","NQ")||"NQ")} style={{height:28,padding:"0 10px",borderRadius:8,background:"rgba(213,0,249,0.08)",border:"1px solid rgba(213,0,249,0.2)",color:"#d500f9",cursor:"pointer",fontSize:11,fontWeight:700}}>⚔️ Battle</button>
              <button onClick={()=>setFriendActionTarget(chatWith)} style={{width:28,height:28,borderRadius:8,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",color:"#9ca3af",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>⋯</button>
              <button onClick={()=>setChatWith(null)} style={{width:28,height:28,borderRadius:8,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",color:"#4b5563",cursor:"pointer",fontSize:17,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>

            <div style={{flex:1,overflowY:"auto",padding:"12px 16px",display:"flex",flexDirection:"column",gap:8}}>
              {messages.map(msg=>{
                const mine=msg.from_id===user?.id;
                const isTradeShare=msg.type==="trade_share";
                const isBattleReq=msg.type==="battle_request";
                return (
                  <div key={msg.id} style={{display:"flex",justifyContent:mine?"flex-end":"flex-start",gap:8}}>
                    {!mine&&<Avatar profile={chatWith} size={24}/>}
                    <div style={{maxWidth:"70%"}}>
                      {isTradeShare&&msg.metadata&&(
                        <div style={{background:"rgba(0,229,255,0.08)",border:"1px solid rgba(0,229,255,0.2)",borderRadius:10,padding:"10px 14px",marginBottom:4}}>
                          <div style={{fontSize:10,color:"#00e5ff",fontWeight:700,marginBottom:4}}>📊 Trade Share</div>
                          <div style={{fontSize:13,fontWeight:800,color:"#f0f6fc"}}>{msg.metadata.ticker} {msg.metadata.side}</div>
                          <div style={{fontSize:12,fontFamily:"monospace",color:(msg.metadata.netPnl||0)>=0?"#00e676":"#ff1744"}}>{fmt$(msg.metadata.netPnl||0)}</div>
                          <div style={{fontSize:10,color:"#4b5563"}}>Entry: ${msg.metadata.entryPrice} → Exit: ${msg.metadata.exitPrice}</div>
                        </div>
                      )}
                      {isBattleReq&&msg.metadata&&(
                        <div style={{background:"rgba(213,0,249,0.08)",border:"1px solid rgba(213,0,249,0.2)",borderRadius:10,padding:"10px 14px",marginBottom:4}}>
                          <div style={{fontSize:10,color:"#d500f9",fontWeight:700,marginBottom:4}}>⚔️ Battle Request</div>
                          <div style={{fontSize:12,color:"#c9d1d9"}}>{msg.content}</div>
                          {!mine&&battles.find(b=>b.id===msg.metadata?.battle_id&&b.status==="pending")&&(
                            <div style={{display:"flex",gap:6,marginTop:8}}>
                              <button onClick={()=>{ respondToBattle(msg.metadata!.battle_id, true).then(()=>{load();setTab("battles");}); }} style={{flex:1,height:28,borderRadius:7,background:"rgba(0,230,118,0.1)",border:"1px solid rgba(0,230,118,0.2)",color:"#00e676",cursor:"pointer",fontSize:11,fontWeight:700}}>Accept</button>
                              <button onClick={()=>respondToBattle(msg.metadata!.battle_id, false).then(load)} style={{flex:1,height:28,borderRadius:7,background:"rgba(255,23,68,0.06)",border:"1px solid rgba(255,23,68,0.15)",color:"#f87171",cursor:"pointer",fontSize:11}}>Decline</button>
                            </div>
                          )}
                        </div>
                      )}
                      {!isTradeShare&&!isBattleReq&&(
                        <div style={{padding:"8px 12px",borderRadius:10,background:mine?"rgba(0,229,255,0.12)":"rgba(255,255,255,0.06)",maxWidth:"100%"}}>
                          <div style={{fontSize:13,color:"#f0f6fc",lineHeight:1.5,wordBreak:"break-word"}}>{msg.content}</div>
                        </div>
                      )}
                      <div style={{fontSize:9,color:"#374151",marginTop:3,textAlign:mine?"right":"left"}}>
                        {new Date(msg.created_at).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",hour12:false})}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={msgEndRef}/>
            </div>

            <div style={{padding:"10px 16px",borderTop:"1px solid rgba(255,255,255,0.06)",display:"flex",gap:8,background:"rgba(0,0,0,0.2)"}}>
              <input value={msgInput} onChange={e=>setMsgInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
                placeholder="Message..." style={{flex:1,height:38,padding:"0 14px",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:10,color:"#f0f6fc",fontSize:13,outline:"none"}}/>
              <button onClick={send} disabled={!msgInput.trim()} style={{height:38,padding:"0 16px",borderRadius:10,border:"none",background:msgInput.trim()?"linear-gradient(135deg,#00e5ff,#0088bb)":"rgba(255,255,255,0.05)",color:msgInput.trim()?"#000":"#374151",cursor:msgInput.trim()?"pointer":"default",fontSize:13,fontWeight:700}}>Send</button>
            </div>
          </>
        )}

        {!activeBattle&&!chatWith&&(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:14,color:"#374151"}}>
            <div style={{fontSize:40}}>💬</div>
            <div style={{fontSize:14,fontWeight:700,color:"#4b5563"}}>Select a conversation</div>
            <div style={{fontSize:12}}>Or add friends to start chatting and battling</div>
          </div>
        )}
      </div>
    </div>

    {friendActionTarget&&(
      <div onClick={()=>setFriendActionTarget(null)} style={{position:"fixed",inset:0,zIndex:99999,background:"rgba(0,0,0,0.75)",backdropFilter:"blur(8px)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
        <div onClick={e=>e.stopPropagation()} style={{background:"#0e1117",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"20px 20px 0 0",padding:"20px 20px 40px",width:"100%",maxWidth:500}}>
          <div style={{width:36,height:4,borderRadius:2,background:"rgba(255,255,255,0.15)",margin:"0 auto 18px"}}/>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
            <Avatar profile={friendActionTarget} size={40}/>
            <div>
              <div style={{fontSize:15,fontWeight:800,color:"#f0f6fc"}}>@{friendActionTarget.username}</div>
              <div style={{fontSize:11,color:"#4b5563"}}>What would you like to do?</div>
            </div>
          </div>
          <button onClick={()=>{const t=friendActionTarget;setFriendActionTarget(null);setConfirmAction({type:"unfriend",friend:t});}} style={{width:"100%",padding:"15px 18px",background:"rgba(249,115,22,0.08)",border:"1px solid rgba(249,115,22,0.2)",borderRadius:13,color:"#f97316",cursor:"pointer",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",gap:12,marginBottom:10,textAlign:"left" as const}}>
            <span style={{fontSize:22}}>👋</span>
            <div><div>Unfriend</div><div style={{fontSize:11,fontWeight:400,opacity:0.7}}>Remove from friends list</div></div>
          </button>
          <button onClick={()=>{const t=friendActionTarget;setFriendActionTarget(null);setConfirmAction({type:"block",friend:t});}} style={{width:"100%",padding:"15px 18px",background:"rgba(255,23,68,0.08)",border:"1px solid rgba(255,23,68,0.2)",borderRadius:13,color:"#ff1744",cursor:"pointer",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",gap:12,marginBottom:14,textAlign:"left" as const}}>
            <span style={{fontSize:22}}>🚫</span>
            <div><div>Block</div><div style={{fontSize:11,fontWeight:400,opacity:0.7}}>They won't be able to contact you</div></div>
          </button>
          <button onClick={()=>setFriendActionTarget(null)} style={{width:"100%",padding:"12px",background:"none",border:"1px solid rgba(255,255,255,0.07)",borderRadius:13,color:"#4b5563",cursor:"pointer",fontSize:13}}>Cancel</button>
        </div>
      </div>
    )}
    {confirmAction&&(
      <div onClick={()=>setConfirmAction(null)} style={{position:"fixed",inset:0,zIndex:99999,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <div onClick={e=>e.stopPropagation()} style={{background:"#0e1117",border:"1px solid rgba(255,255,255,0.1)",borderRadius:18,padding:32,width:"100%",maxWidth:320,textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:12}}>{confirmAction.type==="block"?"🚫":"👋"}</div>
          <div style={{fontSize:16,fontWeight:800,color:"#f0f6fc",marginBottom:8}}>{confirmAction.type==="block"?"Block":"Unfriend"} @{confirmAction.friend.username}?</div>
          <div style={{fontSize:12,color:"#4b5563",marginBottom:24,lineHeight:1.6}}>{confirmAction.type==="block"?"They won't be able to message you.":"You'll be removed from each other's friends lists."}</div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setConfirmAction(null)} style={{flex:1,padding:"12px",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",color:"#6b7280",cursor:"pointer",fontSize:13}}>Cancel</button>
            <button onClick={()=>confirmAction.type==="block"?handleBlock(confirmAction.friend.id):handleUnfriend(confirmAction.friend.id)} style={{flex:1,padding:"12px",borderRadius:10,border:"none",background:confirmAction.type==="block"?"#ff1744":"#f97316",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:700}}>{confirmAction.type==="block"?"Block":"Unfriend"}</button>
          </div>
        </div>
      </div>
    )}

    {/* Friend action bottom sheet */}
    {friendActionTarget&&(
      <div onClick={()=>setFriendActionTarget(null)} style={{position:"fixed",inset:0,zIndex:99999,background:"rgba(0,0,0,0.75)",backdropFilter:"blur(8px)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
        <div onClick={e=>e.stopPropagation()} style={{background:"#0e1117",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"20px 20px 0 0",padding:"20px 20px 40px",width:"100%",maxWidth:500}}>
          <div style={{width:36,height:4,borderRadius:2,background:"rgba(255,255,255,0.15)",margin:"0 auto 18px"}}/>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,padding:"0 4px"}}>
            <Avatar profile={friendActionTarget} size={40}/>
            <div>
              <div style={{fontSize:15,fontWeight:800,color:"#f0f6fc"}}>@{friendActionTarget.username}</div>
              <div style={{fontSize:11,color:"#4b5563"}}>What would you like to do?</div>
            </div>
          </div>
          <button onClick={()=>{const t=friendActionTarget;setFriendActionTarget(null);setConfirmAction({type:"unfriend",friend:t});}} style={{width:"100%",padding:"15px 18px",background:"rgba(249,115,22,0.08)",border:"1px solid rgba(249,115,22,0.2)",borderRadius:13,color:"#f97316",cursor:"pointer",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",gap:12,marginBottom:10,textAlign:"left" as const}}>
            <span style={{fontSize:22}}>👋</span>
            <div><div>Unfriend</div><div style={{fontSize:11,fontWeight:400,opacity:0.7}}>Remove from friends list</div></div>
          </button>
          <button onClick={()=>{const t=friendActionTarget;setFriendActionTarget(null);setConfirmAction({type:"block",friend:t});}} style={{width:"100%",padding:"15px 18px",background:"rgba(255,23,68,0.08)",border:"1px solid rgba(255,23,68,0.2)",borderRadius:13,color:"#ff1744",cursor:"pointer",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",gap:12,marginBottom:14,textAlign:"left" as const}}>
            <span style={{fontSize:22}}>🚫</span>
            <div><div>Block</div><div style={{fontSize:11,fontWeight:400,opacity:0.7}}>They won't be able to contact you</div></div>
          </button>
          <button onClick={()=>setFriendActionTarget(null)} style={{width:"100%",padding:"12px",background:"none",border:"1px solid rgba(255,255,255,0.07)",borderRadius:13,color:"#4b5563",cursor:"pointer",fontSize:13}}>Cancel</button>
        </div>
      </div>
    )}

    {/* Confirm action modal */}
    {confirmAction&&(
      <div onClick={()=>setConfirmAction(null)} style={{position:"fixed",inset:0,zIndex:99999,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <div onClick={e=>e.stopPropagation()} style={{background:"#0e1117",border:"1px solid rgba(255,255,255,0.1)",borderRadius:18,padding:32,width:"100%",maxWidth:320,textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:12}}>{confirmAction.type==="block"?"🚫":"👋"}</div>
          <div style={{fontSize:16,fontWeight:800,color:"#f0f6fc",marginBottom:8}}>
            {confirmAction.type==="block"?"Block":"Unfriend"} @{confirmAction.friend.username}?
          </div>
          <div style={{fontSize:12,color:"#4b5563",marginBottom:24,lineHeight:1.6}}>
            {confirmAction.type==="block"?"They won't be able to message you or appear in your community.":"You'll be removed from each other's friends lists."}
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setConfirmAction(null)} style={{flex:1,padding:"12px",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",color:"#6b7280",cursor:"pointer",fontSize:13}}>Cancel</button>
            <button onClick={()=>confirmAction.type==="block"?handleBlock(confirmAction.friend.id):handleUnfriend(confirmAction.friend.id)} style={{flex:1,padding:"12px",borderRadius:10,border:"none",background:confirmAction.type==="block"?"#ff1744":"#f97316",color:"#fff",cursor:"pointer",fontSize:13,fontWeight:700}}>
              {confirmAction.type==="block"?"Block":"Unfriend"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}