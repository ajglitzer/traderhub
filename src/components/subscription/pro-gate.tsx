"use client";
import { useState } from "react";
import { useSubscription } from "@/hooks/useSubscription";

// ── Pricing modal ─────────────────────────────────────────────────────────────
export function PricingModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState<"monthly"|"annual"|null>(null);
  const [err, setErr] = useState("");

  const checkout = async (plan: "monthly"|"annual") => {
    setLoading(plan); setErr("");
    try {
      const r = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const d = await r.json();
      if (d.url) window.location.href = d.url;
      else setErr(d.error || "Something went wrong");
    } catch { setErr("Network error"); }
    setLoading(null);
  };

  const PERKS = [
    "📈  Chart Replay — watch every trade bar-by-bar",
    "🤖  AI Trade Analysis — 20 AI analyses/day, Groq-powered",
    "📤  Export CSV / JSON — download your data",
    "🔒  All future Pro features",
  ];

  return (
    <div onClick={e=>{ if(e.target===e.currentTarget) onClose(); }} style={{
      position:"fixed",inset:0,zIndex:99999,background:"rgba(0,0,0,0.85)",
      backdropFilter:"blur(12px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,
    }}>
      <div style={{
        width:"100%",maxWidth:480,background:"linear-gradient(160deg,#0f1520,#0b1017)",
        border:"1px solid rgba(255,255,255,0.1)",borderRadius:20,padding:32,
        boxShadow:"0 0 80px rgba(0,229,255,0.1)",
      }}>
        {/* Header */}
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:13,fontWeight:700,color:"#00e5ff",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>TraderHub Pro</div>
          <div style={{fontSize:26,fontWeight:900,color:"#f0f6fc",letterSpacing:"-0.03em"}}>Unlock the full edge</div>
          <div style={{fontSize:13,color:"#4b5563",marginTop:6}}>Everything you need to trade smarter</div>
        </div>

        {/* Perks */}
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:28}}>
          {PERKS.map(p=>(
            <div key={p} style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,0.03)",borderRadius:10,padding:"10px 14px",border:"1px solid rgba(255,255,255,0.05)"}}>
              <span style={{fontSize:13,color:"#c9d1d9"}}>{p}</span>
            </div>
          ))}
        </div>

        {/* Plans */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
          {/* Monthly */}
          <button onClick={()=>checkout("monthly")} disabled={!!loading} style={{
            background: loading==="monthly" ? "rgba(0,229,255,0.2)" : "rgba(255,255,255,0.04)",
            border:"1px solid rgba(255,255,255,0.1)",borderRadius:14,padding:"18px 12px",
            cursor:"pointer",textAlign:"center",transition:"all 0.15s",
          }}
          onMouseEnter={e=>(e.currentTarget.style.borderColor="rgba(0,229,255,0.4)")}
          onMouseLeave={e=>(e.currentTarget.style.borderColor="rgba(255,255,255,0.1)")}
          >
            <div style={{fontSize:11,color:"#4b5563",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Monthly</div>
            <div style={{fontSize:28,fontWeight:900,color:"#f0f6fc",fontFamily:"monospace"}}>$6.99</div>
            <div style={{fontSize:11,color:"#4b5563",marginTop:4}}>per month</div>
            {loading==="monthly" && <div style={{fontSize:11,color:"#00e5ff",marginTop:8}}>Redirecting…</div>}
          </button>

          {/* Annual */}
          <button onClick={()=>checkout("annual")} disabled={!!loading} style={{
            background: loading==="annual" ? "rgba(0,229,255,0.2)" : "linear-gradient(135deg,rgba(0,229,255,0.08),rgba(0,136,187,0.08))",
            border:"1px solid rgba(0,229,255,0.25)",borderRadius:14,padding:"18px 12px",
            cursor:"pointer",textAlign:"center",transition:"all 0.15s",position:"relative",
          }}
          onMouseEnter={e=>(e.currentTarget.style.borderColor="rgba(0,229,255,0.6)")}
          onMouseLeave={e=>(e.currentTarget.style.borderColor="rgba(0,229,255,0.25)")}
          >
            <div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",background:"#00e5ff",color:"#000",fontSize:10,fontWeight:800,padding:"2px 10px",borderRadius:20,whiteSpace:"nowrap"}}>SAVE 28%</div>
            <div style={{fontSize:11,color:"#00e5ff",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Annual</div>
            <div style={{fontSize:28,fontWeight:900,color:"#f0f6fc",fontFamily:"monospace"}}>$59.99</div>
            <div style={{fontSize:11,color:"#4b5563",marginTop:4}}>$5.00 / mo · billed yearly</div>
            {loading==="annual" && <div style={{fontSize:11,color:"#00e5ff",marginTop:8}}>Redirecting…</div>}
          </button>
        </div>

        {err && <div style={{fontSize:12,color:"#ff1744",textAlign:"center",marginBottom:12}}>{err}</div>}

        <div style={{fontSize:11,color:"#3d4551",textAlign:"center",lineHeight:1.6}}>
          Secure payment via Stripe · Cancel anytime · No hidden fees
        </div>

        <button onClick={onClose} style={{display:"block",margin:"20px auto 0",background:"none",border:"none",color:"#3d4551",cursor:"pointer",fontSize:12}}>
          Maybe later
        </button>
      </div>
    </div>
  );
}

// ── Feature lock wrapper ──────────────────────────────────────────────────────
export function ProGate({ children, feature }: { children: React.ReactNode; feature: string }) {
  const { isPro, status } = useSubscription();
  const [showModal, setShowModal] = useState(false);

  if (status === "loading") return null;
  if (isPro) return <>{children}</>;

  return (
    <>
      <div onClick={()=>setShowModal(true)} style={{position:"relative",cursor:"pointer",display:"inline-flex"}}>
        <div style={{pointerEvents:"none",opacity:0.35}}>{children}</div>
        <div style={{
          position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
          background:"rgba(0,0,0,0.6)",borderRadius:8,
        }}>
          <span style={{fontSize:10,fontWeight:700,color:"#00e5ff",background:"rgba(0,0,0,0.8)",padding:"3px 8px",borderRadius:20,border:"1px solid rgba(0,229,255,0.3)"}}>PRO</span>
        </div>
      </div>
      {showModal && <PricingModal onClose={()=>setShowModal(false)}/>}
    </>
  );
}

// ── Inline upgrade button (for settings page) ─────────────────────────────────
export function ManageSubscription() {
  const { isPro, plan, periodEnd, status } = useSubscription();
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const openPortal = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/subscription/portal", { method: "POST" });
      const d = await r.json();
      if (d.url) window.location.href = d.url;
    } catch {}
    setLoading(false);
  };

  if (status === "loading") return null;

  if (isPro) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(0,229,255,0.05)",border:"1px solid rgba(0,229,255,0.15)",borderRadius:12,padding:"14px 18px"}}>
      <div>
        <div style={{fontSize:13,fontWeight:700,color:"#00e5ff"}}>TraderHub Pro · {plan === "annual" ? "Annual" : "Monthly"}</div>
        {periodEnd && <div style={{fontSize:11,color:"#4b5563",marginTop:2}}>Renews {new Date(periodEnd).toLocaleDateString()}</div>}
      </div>
      <button onClick={openPortal} disabled={loading} style={{height:32,padding:"0 14px",borderRadius:8,border:"1px solid rgba(0,229,255,0.3)",background:"rgba(0,229,255,0.08)",color:"#00e5ff",cursor:"pointer",fontSize:12,fontWeight:700}}>
        {loading ? "…" : "Manage"}
      </button>
    </div>
  );

  return (
    <>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12,padding:"14px 18px"}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:"#f0f6fc"}}>Free Plan</div>
          <div style={{fontSize:11,color:"#4b5563",marginTop:2}}>Upgrade for replay, AI & exports</div>
        </div>
        <button onClick={()=>setShowModal(true)} style={{height:32,padding:"0 16px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#00e5ff,#0088bb)",color:"#000",cursor:"pointer",fontSize:12,fontWeight:800}}>
          Upgrade
        </button>
      </div>
      {showModal && <PricingModal onClose={()=>setShowModal(false)}/>}
    </>
  );
}
