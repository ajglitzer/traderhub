"use client";
import { useStore } from "@/store";
import { useAuth } from "@/components/auth/auth-provider";
import { useEffect, useState } from "react";

const NAV = [
  { id:"dashboard",  label:"Dashboard",  icon:"◈" },
  { id:"trades",     label:"Trade Log",  icon:"≋" },
  { id:"analytics",  label:"Analytics",  icon:"⌬" },
  { id:"calendar",   label:"Calendar",   icon:"⊡" },
  { id:"playbook",   label:"Playbook",   icon:"◧" },
  { id:"checklist",  label:"Checklist",  icon:"☑" },
  { id:"journal",    label:"Journal",    icon:"◧" },
  { id:"recap",      label:"AI Recap",   icon:"✦" },
  { id:"simulator",  label:"Simulator",  icon:"⬡" },
  { id:"goals",      label:"Goals",        icon:"◎" },
  { id:"econ",       label:"Econ Calendar", icon:"⊡" },
  { id:"social",     label:"Community",  icon:"◎" },
  { id:"patterns",   label:"AI Patterns",icon:"✦" },
  { id:"markets",    label:"Markets",    icon:"⟡" },
  { id:"import",     label:"Import",     icon:"⊕" },
  { id:"settings",   label:"Settings",   icon:"⊛" },
];

// Bottom nav items for mobile (most important ones)
const MOBILE_NAV = [
  { id:"dashboard", label:"Home",      icon:"◈" },
  { id:"trades",    label:"Trades",    icon:"≋" },
  { id:"analytics", label:"Analytics", icon:"⌬" },
  { id:"social",    label:"Community", icon:"◎" },
  { id:"more",      label:"More",      icon:"⋯" },
];

export function Sidebar() {
  const { sidebarOpen, setSidebarOpen, activeTab, setActiveTab, communityBadge } = useStore();
  const { user, loading } = useAuth();
  const [localUser, setLocalUser] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth < 768 : false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    try { if (localStorage.getItem("th_user")) setLocalUser(true); } catch {}
  }, []);

  const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder");
  const isAuthed = hasSupabase ? (!loading && !!user) : localUser;
  if (!isAuthed) return null;

  // Mobile: bottom nav + full-screen drawer
  if (isMobile) {
    return (
      <>
        {/* Full-screen drawer for "More" */}
        {showMobileMenu && (
          <div onClick={() => setShowMobileMenu(false)} style={{
            position:"fixed", inset:0, zIndex:999,
            background:"rgba(0,0,0,0.7)", backdropFilter:"blur(8px)",
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              position:"absolute", bottom:70, left:0, right:0,
              background:"linear-gradient(180deg,#0d1219,#060a0f)",
              borderTop:"1px solid rgba(255,255,255,0.08)",
              borderRadius:"20px 20px 0 0",
              padding:"16px 16px 8px",
              maxHeight:"70vh", overflowY:"auto",
            }}>
              <div style={{width:40,height:4,borderRadius:2,background:"rgba(255,255,255,0.15)",margin:"0 auto 16px"}}/>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                {NAV.filter(n=>!["dashboard","trades","analytics","social"].includes(n.id)).map(({id,label,icon})=>{
                  const active = activeTab === id;
                  return (
                    <button key={id} onClick={()=>{setActiveTab(id);setShowMobileMenu(false);}} style={{
                      display:"flex",flexDirection:"column",alignItems:"center",gap:6,
                      padding:"14px 8px",borderRadius:12,border:"1px solid",
                      borderColor:active?"rgba(0,229,255,0.3)":"rgba(255,255,255,0.06)",
                      background:active?"rgba(0,229,255,0.1)":"rgba(255,255,255,0.03)",
                      color:active?"#00e5ff":"#6b7280",cursor:"pointer",
                    }}>
                      <span style={{fontSize:20}}>{icon}</span>
                      <span style={{fontSize:10,fontWeight:600,textAlign:"center"}}>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Bottom nav bar */}
        <nav style={{
          position:"fixed", bottom:0, left:0, right:0, zIndex:998,
          height:62, background:"rgba(6,10,15,0.97)",
          borderTop:"1px solid rgba(255,255,255,0.08)",
          backdropFilter:"blur(20px)",
          display:"flex", alignItems:"center",
          paddingBottom:"env(safe-area-inset-bottom)",
        }}>
          {MOBILE_NAV.map(({id,label,icon})=>{
            const active = id === "more" ? showMobileMenu : activeTab === id;
            const badge = id === "social" && activeTab !== "social" ? communityBadge : 0;
            return (
              <button key={id} onClick={()=>{
                if(id==="more"){setShowMobileMenu(p=>!p);}
                else{setActiveTab(id);setShowMobileMenu(false);}
              }} style={{
                flex:1, display:"flex", flexDirection:"column", alignItems:"center",
                justifyContent:"center", gap:3, padding:"8px 0",
                background:"none", border:"none",
                color:active?"#00e5ff":"#4b5563",
                cursor:"pointer", position:"relative",
              }}>
                <span style={{fontSize:18,filter:active?"drop-shadow(0 0 6px rgba(0,229,255,0.7))":"none",position:"relative"}}>
                  {icon}
                  {badge > 0 && (
                    <span style={{position:"absolute",top:-4,right:-6,width:8,height:8,borderRadius:"50%",background:"#00e5ff",boxShadow:"0 0 6px rgba(0,229,255,0.8)"}}/>
                  )}
                </span>
                <span style={{fontSize:9,fontWeight:active?700:400}}>{label}</span>
                {active && id !== "more" && (
                  <div style={{position:"absolute",bottom:0,left:"50%",transform:"translateX(-50%)",width:20,height:2,borderRadius:1,background:"#00e5ff"}}/>
                )}
              </button>
            );
          })}
        </nav>
      </>
    );
  }

  // Desktop sidebar (unchanged)
  return (
    <aside style={{
      width: sidebarOpen ? 198 : 54,
      minWidth: sidebarOpen ? 198 : 54,
      transition: "width 0.22s cubic-bezier(0.4,0,0.2,1), min-width 0.22s cubic-bezier(0.4,0,0.2,1)",
      background: "linear-gradient(180deg, #080d14 0%, #060a0f 100%)",
      borderRight: "1px solid rgba(255,255,255,0.05)",
      display: "flex", flexDirection: "column",
      height: "100vh", overflow: "hidden", flexShrink: 0,
      position: "relative" as const,
    }}>
      <div style={{ position:"absolute", top:0, bottom:0, right:0, width:1, background:"linear-gradient(180deg, transparent, rgba(0,229,255,0.15) 40%, rgba(0,229,255,0.15) 60%, transparent)", pointerEvents:"none" }}/>

      <div style={{ height:54, display:"flex", alignItems:"center", padding: sidebarOpen ? "0 16px" : "0", justifyContent: sidebarOpen ? "flex-start" : "center", borderBottom:"1px solid rgba(255,255,255,0.04)", gap:10, flexShrink:0 }}>
        <div style={{ width:32, height:32, borderRadius:10, flexShrink:0, background:"linear-gradient(135deg, #00e5ff 0%, #0077aa 100%)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:900, color:"#000", boxShadow:"0 0 20px rgba(0,229,255,0.4), 0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.3)" }}>T</div>
        {sidebarOpen && (
          <div style={{ overflow:"hidden" }}>
            <div style={{ fontSize:13, fontWeight:800, color:"#f0f6fc", letterSpacing:"-0.03em", lineHeight:1 }}>TraderHub</div>
            <div style={{ fontSize:9, color:"rgba(0,229,255,0.6)", letterSpacing:"0.14em", textTransform:"uppercase", marginTop:2 }}>PRO</div>
          </div>
        )}
      </div>

      <nav style={{ flex:1, padding:"10px 7px", display:"flex", flexDirection:"column", gap:2 }}>
        {NAV.map(({ id, label, icon }) => {
          const active = activeTab === id;
          const badge = id === "social" && activeTab !== "social" ? communityBadge : 0;
          return (
            <button key={id} onClick={() => setActiveTab(id)} title={!sidebarOpen ? label : undefined}
              style={{
                display:"flex", alignItems:"center", gap:10,
                padding: sidebarOpen ? "9px 11px" : "9px 0",
                justifyContent: sidebarOpen ? "flex-start" : "center",
                width:"100%", borderRadius:10, border:"none",
                background: active ? "linear-gradient(135deg, rgba(0,229,255,0.12) 0%, rgba(0,120,180,0.08) 100%)" : "transparent",
                outline: active ? "1px solid rgba(0,229,255,0.2)" : "none",
                color: active ? "#00e5ff" : "#4b5563",
                cursor:"pointer", fontSize:13, fontWeight: active ? 600 : 400,
                transition:"all 0.12s", textAlign:"left" as const,
                position:"relative" as const,
                boxShadow: active ? "0 0 12px rgba(0,229,255,0.08) inset" : "none",
              }}
              onMouseEnter={e=>{if(!active){(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.04)";(e.currentTarget as HTMLElement).style.color="#8b949e";}}}
              onMouseLeave={e=>{if(!active){(e.currentTarget as HTMLElement).style.background="transparent";(e.currentTarget as HTMLElement).style.color="#4b5563";}}}
            >
              <span style={{ fontSize:16, width:18, textAlign:"center" as const, flexShrink:0, filter: active ? "drop-shadow(0 0 6px rgba(0,229,255,0.7))" : "none", position:"relative" as const }}>
                {icon}
                {badge > 0 && (
                  <span style={{ position:"absolute", top:-4, right:-4, width:8, height:8, borderRadius:"50%", background:"#00e5ff", boxShadow:"0 0 6px rgba(0,229,255,0.8)", display:"block" }}/>
                )}
              </span>
              {sidebarOpen && <span style={{ whiteSpace:"nowrap", overflow:"hidden", fontSize:13 }}>{label}</span>}
              {sidebarOpen && badge > 0 && (
                <span style={{ marginLeft:"auto", minWidth:18, height:18, borderRadius:9, background:"rgba(0,229,255,0.15)", border:"1px solid rgba(0,229,255,0.3)", fontSize:9, fontWeight:800, color:"#00e5ff", display:"flex", alignItems:"center", justifyContent:"center", padding:"0 4px" }}>{badge}</span>
              )}
              {active && sidebarOpen && badge === 0 && (
                <div style={{ marginLeft:"auto", width:5, height:5, borderRadius:"50%", background:"#00e5ff", flexShrink:0, boxShadow:"0 0 8px #00e5ff" }} className="pulse"/>
              )}
            </button>
          );
        })}
      </nav>

      <div style={{ padding:"8px 7px", borderTop:"1px solid rgba(255,255,255,0.04)", flexShrink:0 }}>
        <button onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{ width:"100%", padding:"7px 0", borderRadius:9, border:"1px solid rgba(255,255,255,0.05)", background:"rgba(255,255,255,0.02)", color:"#3d4551", cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", gap:6, transition:"all 0.12s" }}
          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color="#6b7280";(e.currentTarget as HTMLElement).style.borderColor="rgba(255,255,255,0.09)";}}
          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color="#3d4551";(e.currentTarget as HTMLElement).style.borderColor="rgba(255,255,255,0.05)";}}>
          <span>{sidebarOpen ? "‹" : "›"}</span>
          {sidebarOpen && <span style={{ fontSize:11 }}>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
