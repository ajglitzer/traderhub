"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAccountStore, Account, ACCOUNT_COLORS } from "@/store/accounts";

function fmt$(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// Renders children into document.body to escape stacking contexts
function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); return () => setMounted(false); }, []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

function AddAccountModal({ onClose }: { onClose: () => void }) {
  const { addAccount, setActiveAccount } = useAccountStore();
  const [name, setName]   = useState("");
  const [bal,  setBal]    = useState("10000");
  const [broker, setBroker] = useState("TradingView Paper");
  const [color, setColor] = useState(ACCOUNT_COLORS[1]);

  const save = () => {
    if (!name.trim()) return;
    const id = addAccount({ name: name.trim(), startingBalance: +bal || 10000, broker: broker.trim(), color });
    setActiveAccount(id);
    onClose();
  };

  const IS = { width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:8, color:"#d1d5db", fontSize:13, padding:"8px 12px", outline:"none", fontFamily:"inherit" } as const;
  const LB = { fontSize:10, fontWeight:700 as const, textTransform:"uppercase" as const, letterSpacing:"0.08em", color:"#3d4551", marginBottom:5, display:"block" } as const;

  return (
    <Portal>
    <div onClick={e => { if(e.target===e.currentTarget) onClose(); }} style={{ position:"fixed",inset:0,zIndex:99999,background:"rgba(0,0,0,0.8)",backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto" as const }}>
      <div style={{ width:"100%",maxWidth:400,maxHeight:"calc(100vh - 32px)",overflowY:"auto" as const,background:"linear-gradient(160deg,#0f1520,#0b1017)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:18,overflow:"hidden",display:"flex",flexDirection:"column" }}>
        <div style={{ padding:"14px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(0,0,0,0.3)" }}>
          <div style={{ fontSize:15,fontWeight:800,color:"#f0f6fc" }}>New Account</div>
          <div style={{ fontSize:11,color:"#4b5563",marginTop:2 }}>Add a trading account to track separately</div>
        </div>
        <div style={{ padding:20,display:"flex",flexDirection:"column",gap:14 }}>
          <div><span style={LB}>Account Name</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Paper Trading, Futures, Prop Firm" style={IS}/></div>
          <div><span style={LB}>Starting Balance ($)</span><input value={bal} onChange={e=>setBal(e.target.value)} type="number" placeholder="10000" style={IS}/></div>
          <div><span style={LB}>Broker / Platform</span><input value={broker} onChange={e=>setBroker(e.target.value)} placeholder="TradingView Paper" style={IS}/></div>
          <div>
            <span style={LB}>Account Color</span>
            <div style={{ display:"flex",gap:8,flexWrap:"wrap" as const }}>
              {ACCOUNT_COLORS.map(c => (
                <button key={c} onClick={()=>setColor(c)} style={{ width:28,height:28,borderRadius:"50%",background:c,border:`3px solid ${color===c?"#fff":"transparent"}`,cursor:"pointer",transition:"transform 0.1s",transform:color===c?"scale(1.15)":"scale(1)" }}/>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display:"flex",gap:8,padding:"12px 20px",borderTop:"1px solid rgba(255,255,255,0.05)",background:"rgba(0,0,0,0.2)" }}>
          <button onClick={onClose} style={{ flex:1,height:34,borderRadius:8,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.04)",color:"#6b7280",cursor:"pointer",fontSize:12 }}>Cancel</button>
          <button onClick={save} style={{ flex:2,height:34,borderRadius:8,border:"none",background:`linear-gradient(135deg,${color},${color}99)`,color:"#000",cursor:"pointer",fontSize:12,fontWeight:800 }}>Create Account</button>
        </div>
      </div>
    </div>
    </Portal>
  );
}

function EditAccountModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const { updateAccount, deleteAccount, accounts } = useAccountStore();
  const [name,   setName]   = useState(account.name);
  const [bal,    setBal]    = useState(account.startingBalance.toString());
  const [broker, setBroker] = useState(account.broker);
  const [color,  setColor]  = useState(account.color);
  const canDelete = accounts.length > 1;

  const save = () => { updateAccount(account.id, { name: name.trim(), startingBalance: +bal||account.startingBalance, broker, color }); onClose(); };
  const del  = () => { if(confirm(`Delete "${account.name}"? This will remove all its trades.`)) { deleteAccount(account.id); onClose(); } };

  const IS = { width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:8, color:"#d1d5db", fontSize:13, padding:"8px 12px", outline:"none", fontFamily:"inherit" } as const;
  const LB = { fontSize:10, fontWeight:700 as const, textTransform:"uppercase" as const, letterSpacing:"0.08em", color:"#3d4551", marginBottom:5, display:"block" } as const;

  return (
    <Portal>
    <div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{ position:"fixed",inset:0,zIndex:99999,background:"rgba(0,0,0,0.8)",backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto" as const }}>
      <div style={{ width:"100%",maxWidth:400,maxHeight:"calc(100vh - 32px)",overflowY:"auto" as const,background:"linear-gradient(160deg,#0f1520,#0b1017)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:18,overflow:"hidden",display:"flex",flexDirection:"column" }}>
        <div style={{ padding:"14px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(0,0,0,0.3)",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <div style={{ fontSize:15,fontWeight:800,color:"#f0f6fc" }}>Edit Account</div>
          {canDelete && (
            <button onClick={del} style={{ height:28,padding:"0 12px",borderRadius:7,border:"1px solid rgba(255,23,68,0.25)",background:"rgba(255,23,68,0.08)",color:"#f87171",cursor:"pointer",fontSize:11,fontWeight:700 }}>Delete</button>
          )}
        </div>
        <div style={{ padding:20,display:"flex",flexDirection:"column",gap:14 }}>
          <div><span style={LB}>Account Name</span><input value={name} onChange={e=>setName(e.target.value)} style={IS}/></div>
          <div><span style={LB}>Starting Balance ($)</span><input value={bal} onChange={e=>setBal(e.target.value)} type="number" style={IS}/></div>
          <div><span style={LB}>Broker / Platform</span><input value={broker} onChange={e=>setBroker(e.target.value)} style={IS}/></div>
          <div>
            <span style={LB}>Color</span>
            <div style={{ display:"flex",gap:8,flexWrap:"wrap" as const }}>
              {ACCOUNT_COLORS.map(c=>(
                <button key={c} onClick={()=>setColor(c)} style={{ width:28,height:28,borderRadius:"50%",background:c,border:`3px solid ${color===c?"#fff":"transparent"}`,cursor:"pointer",transform:color===c?"scale(1.15)":"scale(1)",transition:"transform 0.1s" }}/>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display:"flex",gap:8,padding:"12px 20px",borderTop:"1px solid rgba(255,255,255,0.05)",background:"rgba(0,0,0,0.2)" }}>
          <button onClick={onClose} style={{ flex:1,height:34,borderRadius:8,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.04)",color:"#6b7280",cursor:"pointer",fontSize:12 }}>Cancel</button>
          <button onClick={save} style={{ flex:2,height:34,borderRadius:8,border:"none",background:`linear-gradient(135deg,${color},${color}99)`,color:"#000",cursor:"pointer",fontSize:12,fontWeight:800 }}>Save Changes</button>
        </div>
      </div>
    </div>
    </Portal>
  );
}

export function AccountSwitcher() {
  const { accounts, activeAccountId, setActiveAccount, tradesByAccount } = useAccountStore();
  const [showAdd,  setShowAdd]  = useState(false);
  const [editing,  setEditing]  = useState<Account|null>(null);

  return (
    <>
      <div style={{ display:"flex", alignItems:"center", gap:4, padding:"0 6px", overflowX:"auto", flexShrink:1, maxWidth:"min(50vw, 340px)", scrollbarWidth:"none" as const }}>
        {accounts.map(acc => {
          const active  = acc.id === activeAccountId;
          const trades  = (tradesByAccount[acc.id] || []).filter(t => t.status === "CLOSED");
          const pnl     = trades.reduce((s, t) => s + (t.netPnl || 0), 0);
          const balance = acc.startingBalance + pnl;
          const isPos   = pnl >= 0;

          return (
            <div key={acc.id} style={{
              display:"flex", alignItems:"center", gap:8,
              padding:"6px 12px", borderRadius:10, cursor:"pointer",
              background: active ? `rgba(${hexToRgb(acc.color)},0.12)` : "transparent",
              border: `1px solid ${active ? acc.color+"50" : "transparent"}`,
              transition:"all 0.15s", flexShrink:0,
              boxShadow: active ? `0 0 12px ${acc.color}20` : "none",
            }}
              onClick={() => setActiveAccount(acc.id)}
            >
              {/* Color dot */}
              <div style={{ width:8,height:8,borderRadius:"50%",background:acc.color,boxShadow:`0 0 6px ${acc.color}`,flexShrink:0 }}/>

              <div>
                <div style={{ fontSize:11,fontWeight:800,color:active?"#f0f6fc":"#6b7280",letterSpacing:"-0.01em" }}>{acc.name}</div>
                <div style={{ fontSize:9,fontFamily:"monospace",color:isPos?"#00e676":"#ff1744",fontWeight:700 }}>
                  {fmt$(balance)} {pnl!==0&&<span style={{opacity:0.7}}>({isPos?"+":""}{fmt$(pnl)})</span>}
                </div>
              </div>

              {active && (
                <button onClick={e=>{e.stopPropagation();setEditing(acc);}} style={{ width:18,height:18,borderRadius:5,background:"rgba(255,255,255,0.07)",border:"none",color:"#4b5563",cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>✎</button>
              )}
            </div>
          );
        })}

        {/* Add account button */}
        <button onClick={()=>setShowAdd(true)} style={{
          height:32, padding:"0 12px", borderRadius:10, border:"1px dashed rgba(255,255,255,0.12)",
          background:"transparent", color:"#4b5563", cursor:"pointer", fontSize:12, fontWeight:700,
          display:"flex", alignItems:"center", gap:5, flexShrink:0, transition:"all 0.15s",
        }}
          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor="rgba(0,229,255,0.3)";(e.currentTarget as HTMLElement).style.color="#00e5ff";}}
          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor="rgba(255,255,255,0.12)";(e.currentTarget as HTMLElement).style.color="#4b5563";}}
        >
          <span style={{fontSize:16,lineHeight:1}}>+</span> Account
        </button>
      </div>

      {showAdd  && <AddAccountModal  onClose={()=>setShowAdd(false)}/>}
      {editing  && <EditAccountModal account={editing} onClose={()=>setEditing(null)}/>}
    </>
  );
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}
