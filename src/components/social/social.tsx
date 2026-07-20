"use client";
import { scopedKey } from "@/lib/user-storage";
import React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { createClient } from "@/lib/supabase";
import {
  Profile, Message, FriendRequest, ReportReason, REPORT_REASONS,
  getFriends, getFriendRequests, sendFriendRequest, respondToFriendRequest,
  unfriendUser, blockUser, unblockUser, getBlockedUsers, reportUser,
  getConversations, getMessages, sendMessage, markMessagesRead, getUnreadCount,
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

// -- Main Social Hub -----------------------------------------------------------
export default function SocialPage({ myProfile }: { myProfile: Profile }) {
  const hasSupabase = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://placeholder.supabase.co");
  if (!hasSupabase) return (
    <div style={{display:"flex",flexDirection:"column" as const,alignItems:"center",justifyContent:"center",height:"100%",gap:16,padding:40}}>
      <div style={{fontSize:36}}>🔌</div>
      <div style={{fontSize:16,fontWeight:800,color:"#f0f6fc"}}>Supabase not configured</div>
      <div style={{fontSize:13,color:"#4b5563",textAlign:"center" as const,maxWidth:420,lineHeight:1.7}}>
        The Community tab requires Supabase for real-time messaging.<br/>
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

  const [tab, setTab] = useState<"messages"|"friends">("messages");
  const [confirmAction, setConfirmAction] = useState<{type:"unfriend"|"block",friend:Profile}|null>(null);
  const [isMob, setIsMob] = useState(()=>typeof window!=="undefined"&&window.innerWidth<768);
  useEffect(()=>{ const h=()=>setIsMob(window.innerWidth<768); window.addEventListener("resize",h); return ()=>window.removeEventListener("resize",h); },[]);
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [blockedProfiles, setBlockedProfiles] = useState<Profile[]>([]);
  const [showBlocked, setShowBlocked] = useState(false);
  const [friendMenu, setFriendMenu] = useState<string|null>(null);
  const [friendActionTarget, setFriendActionTarget] = useState<Profile|null>(null);
  const [reportTarget, setReportTarget] = useState<Profile|null>(null);
  const [reportSent, setReportSent] = useState(false);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [convos, setConvos] = useState<{profile:Profile;lastMessage:Message;unread:number}[]>([]);
  const [chatWith, setChatWith] = useState<Profile|null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgInput, setMsgInput] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchRes, setSearchRes] = useState<Profile[]>([]);
  const removedIds = React.useRef<Set<string>>(new Set<string>());
  React.useEffect(()=>{
    try{ const saved=JSON.parse(localStorage.getItem(scopedKey("th_removed_friends"))||"[]"); removedIds.current=new Set(saved); }catch{}
  },[]);
  const addRemovedId = (id:string)=>{
    removedIds.current.add(id);
    try{ localStorage.setItem(scopedKey("th_removed_friends"), JSON.stringify([...removedIds.current])); }catch{}
  };
  const persistRemovedIds = ()=>{
    try{ localStorage.setItem(scopedKey("th_removed_friends"), JSON.stringify([...removedIds.current])); }catch{}
  };
  const [unread, setUnread] = useState(0);
  const msgEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const load = useCallback(async()=>{
    if(!user) return;
    const [f,r,c,u] = await Promise.all([
      getFriends(user.id), getFriendRequests(user.id),
      getConversations(user.id),
      getUnreadCount(user.id),
    ]);
    const rid = removedIds.current;
    // Self-heal: the server is authoritative. If it says someone is
    // currently a friend/conversation partner (already excludes blocked
    // users), any stale "removed" marker from a past unfriend/block is
    // wrong — e.g. after re-friending someone you'd previously unfriended.
    let ridChanged = false;
    for (const x of f as any[]) { if (rid.delete(x.id)) ridChanged = true; }
    for (const x of c as any[]) { if (rid.delete(x.profile.id)) ridChanged = true; }
    if (ridChanged) persistRemovedIds();
    const filteredFriends = f.filter((x:any)=>!rid.has(x.id));
    const filteredConvos = c.filter((x:any)=>!rid.has(x.profile.id));
    setFriends(filteredFriends);
    setRequests(r);
    setConvos(filteredConvos);
    setUnread(u);
    // If the active chat person is no longer in allowed conversations, close the chat
    setChatWith(prev => {
      if (!prev) return null;
      const stillAllowed = filteredConvos.some((x:any) => x.profile.id === prev.id) ||
                           filteredFriends.some((x:any) => x.id === prev.id);
      if (!stillAllowed) { setMessages([]); return null; }
      return prev;
    });
    if(user) { const bids = await getBlockedUsers(user.id); setBlockedIds(bids); const bprofs = await Promise.all(bids.map(async(bid:string)=>{ try{ const r=await supabase.from("profiles").select("*").eq("id",bid).single(); return r.data; }catch{ return null; } })); setBlockedProfiles(bprofs.filter(Boolean) as Profile[]); }
    // Update sidebar badge when not on community tab
    const pendingR = r.filter((req:FriendRequest)=>req.to_id===user.id&&req.status==="pending");
    const total = u + pendingR.length;
    setCommunityBadge(total);
  },[user, setCommunityBadge]);

  // Clear badge when user opens community tab
  useEffect(()=>{ if(activeTab==="social") setCommunityBadge(0); },[activeTab, setCommunityBadge]);

  useEffect(()=>{ load(); },[load]);

  // Realtime — messages, friend changes, blocks
  useEffect(()=>{
    if(!user) return;

    // When someone unfriends or blocks us, reload so they disappear
    const ch = supabase.channel("social_realtime")
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},()=>{
        load();
        if(chatWith) loadMessages(chatWith.id);
      })
      .on("postgres_changes",{event:"*",schema:"public",table:"friend_requests"},()=>{
        load();
      })
      .on("postgres_changes",{event:"*",schema:"public",table:"blocks"},()=>{
        // When we get blocked or someone we blocked changes — reload everything
        // Also clear the active chat if the person is now blocked/unfriended
        load();
        setChatWith(null);
        setMessages([]);
      })
      .subscribe();
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
      const r = await searchProfiles(searchQ, user?.id);
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
  const handleUnfriend = async(fid:string)=>{
    if(!user) return;
    addRemovedId(fid);
    await unfriendUser(user.id,fid);
    setConfirmAction(null);
    setChatWith(p=>p?.id===fid?null:p);
    setFriends(prev=>prev.filter(f=>f.id!==fid));
    setConvos(prev=>prev.filter(cv=>cv.profile.id!==fid));
  };
  const handleUnblock = async(fid:string)=>{ if(!user) return; await unblockUser(user.id,fid); load(); };
  const handleBlock = async(fid:string)=>{
    if(!user) return;
    addRemovedId(fid);
    await blockUser(user.id,fid);
    setConfirmAction(null);
    setChatWith(p=>p?.id===fid?null:p);
    setFriends(prev=>prev.filter(f=>f.id!==fid));
    setConvos(prev=>prev.filter(cv=>cv.profile.id!==fid));
  };

  const respondReq = async(id:string,status:"accepted"|"declined")=>{ await respondToFriendRequest(id,status); load(); };

  const handleReport = async(reason:ReportReason)=>{
    if(!user||!reportTarget) return;
    const ok = await reportUser(user.id, reportTarget.id, reason);
    setReportTarget(null);
    if(ok){ setReportSent(true); setTimeout(()=>setReportSent(false),3000); }
  };

  const pendingRequests = requests.filter(r=>r.to_id===user?.id&&r.status==="pending");

  const TABS = [
    {id:"messages" as const, label:"Messages", badge:unread},
    {id:"friends"  as const, label:"Friends",  badge:pendingRequests.length},
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
              <div key={conv.profile.id} style={{
                display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
                background:chatWith?.id===conv.profile.id?"rgba(0,229,255,0.06)":"transparent",
                borderBottom:"1px solid rgba(255,255,255,0.04)",
              }}>
                <div onClick={()=>openChat(conv.profile)} style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0,cursor:"pointer"}}>
                  <Avatar profile={conv.profile} size={34}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#f0f6fc"}}>@{conv.profile.username}</div>
                    <div style={{fontSize:11,color:"#4b5563",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{conv.lastMessage.content.slice(0,40)}</div>
                  </div>
                </div>
                {conv.unread>0&&<span style={{width:18,height:18,borderRadius:"50%",background:"#00e5ff",fontSize:10,fontWeight:800,color:"#000",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{conv.unread}</span>}
                <button onClick={e=>{e.stopPropagation();setFriendActionTarget(conv.profile);}} style={{width:28,height:28,borderRadius:7,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",color:"#6b7280",cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>···</button>
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

                <button onClick={()=>setFriendActionTarget(f)} style={{height:26,width:26,borderRadius:7,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",color:"#9ca3af",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>⋯</button>
              </div>
            ))}
          </div>
        )}


      </div>

      {/* Right panel - chat */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
        {chatWith&&(
          <>
            <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",gap:10,background:"rgba(0,0,0,0.2)"}}>
              <Avatar profile={chatWith} size={32}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:800,color:"#f0f6fc"}}>@{chatWith.username}</div>
                <div style={{fontSize:10,color:"#4b5563"}}>{chatWith.display_name}</div>
              </div>
              <button onClick={shareLastTrade} title="Share your last trade" style={{height:28,padding:"0 10px",borderRadius:8,background:"rgba(0,229,255,0.08)",border:"1px solid rgba(0,229,255,0.15)",color:"#00e5ff",cursor:"pointer",fontSize:11,fontWeight:700,display:isMob?"none":"flex"}}>📊 Share Trade</button>

              <button onClick={()=>setFriendActionTarget(chatWith)} title="More options" style={{width:32,height:32,borderRadius:8,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",color:"#9ca3af",cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>⋯</button>
              <button onClick={()=>setChatWith(null)} style={{width:28,height:28,borderRadius:8,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",color:"#4b5563",cursor:"pointer",fontSize:17,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>

            <div style={{flex:1,overflowY:"auto",padding:"12px 16px",display:"flex",flexDirection:"column",gap:8}}>
              {messages.map(msg=>{
                const mine=msg.from_id===user?.id;
                const isTradeShare=msg.type==="trade_share";
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
                      {!isTradeShare&&(
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

        {!chatWith&&(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:14,color:"#374151"}}>
            <div style={{fontSize:40}}>💬</div>
            <div style={{fontSize:14,fontWeight:700,color:"#4b5563"}}>Select a conversation</div>
            <div style={{fontSize:12}}>Or add friends to start chatting</div>
          </div>
        )}
      </div>
    </div>


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
          <button onClick={()=>{const t=friendActionTarget;setFriendActionTarget(null);setConfirmAction({type:"block",friend:t});}} style={{width:"100%",padding:"15px 18px",background:"rgba(255,23,68,0.08)",border:"1px solid rgba(255,23,68,0.2)",borderRadius:13,color:"#ff1744",cursor:"pointer",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",gap:12,marginBottom:10,textAlign:"left" as const}}>
            <span style={{fontSize:22}}>🚫</span>
            <div><div>Block</div><div style={{fontSize:11,fontWeight:400,opacity:0.7}}>They won't be able to contact you</div></div>
          </button>
          <button onClick={()=>{const t=friendActionTarget;setFriendActionTarget(null);setReportTarget(t);}} style={{width:"100%",padding:"15px 18px",background:"rgba(255,171,0,0.08)",border:"1px solid rgba(255,171,0,0.2)",borderRadius:13,color:"#ffab00",cursor:"pointer",fontSize:14,fontWeight:700,display:"flex",alignItems:"center",gap:12,marginBottom:14,textAlign:"left" as const}}>
            <span style={{fontSize:22}}>🚩</span>
            <div><div>Report</div><div style={{fontSize:11,fontWeight:400,opacity:0.7}}>Flag this user for review</div></div>
          </button>
          <button onClick={()=>setFriendActionTarget(null)} style={{width:"100%",padding:"12px",background:"none",border:"1px solid rgba(255,255,255,0.07)",borderRadius:13,color:"#4b5563",cursor:"pointer",fontSize:13}}>Cancel</button>
        </div>
      </div>
    )}

    {/* Report reason picker */}
    {reportTarget&&(
      <div onClick={()=>setReportTarget(null)} style={{position:"fixed",inset:0,zIndex:99999,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <div onClick={e=>e.stopPropagation()} style={{background:"#0e1117",border:"1px solid rgba(255,255,255,0.1)",borderRadius:18,padding:28,width:"100%",maxWidth:360}}>
          <div style={{fontSize:15,fontWeight:800,color:"#f0f6fc",marginBottom:4}}>Report @{reportTarget.username}</div>
          <div style={{fontSize:12,color:"#4b5563",marginBottom:18,lineHeight:1.6}}>Why are you reporting this user? They won't be notified.</div>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
            {REPORT_REASONS.map(reason=>(
              <button key={reason} onClick={()=>handleReport(reason)} style={{padding:"12px 14px",borderRadius:10,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.03)",color:"#d1d5db",cursor:"pointer",fontSize:13,textAlign:"left" as const}}>{reason}</button>
            ))}
          </div>
          <button onClick={()=>setReportTarget(null)} style={{width:"100%",padding:"12px",background:"none",border:"1px solid rgba(255,255,255,0.07)",borderRadius:13,color:"#4b5563",cursor:"pointer",fontSize:13}}>Cancel</button>
        </div>
      </div>
    )}

    {/* Report confirmation toast */}
    {reportSent&&(
      <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",zIndex:100000,background:"#0e1117",border:"1px solid rgba(0,230,118,0.3)",borderRadius:12,padding:"12px 20px",color:"#00e676",fontSize:13,fontWeight:700,boxShadow:"0 8px 24px rgba(0,0,0,0.5)"}}>
        ✓ Report submitted — thank you
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