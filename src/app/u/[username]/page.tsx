import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function hexToRgb(hex: string) {
  const h = hex.replace("#","");
  return `${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)}`;
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  if (!URL || URL.includes("placeholder")) notFound();

  let profile: any = null;
  let simStats: any = null;

  try {
    const cookieStore = await cookies();
    const sb = createServerClient(URL, KEY, { cookies:{ getAll:()=>cookieStore.getAll(), setAll:()=>{} } });
    const { data: p } = await sb.from("profiles").select("*").eq("username", username.toLowerCase()).single();
    if (!p) notFound();
    profile = p;
    if (p.show_real_stats) {
      const { data: lb } = await sb.from("sim_leaderboard").select("*").eq("user_id", p.id).order("balance",{ascending:false}).limit(1);
      if (lb?.length) simStats = lb[0];
    }
  } catch { notFound(); }

  const color = profile.avatar_color || "#00e5ff";
  const rgb = hexToRgb(color);
  const initials = (profile.display_name || profile.username).slice(0,2).toUpperCase();
  const since = new Date(profile.created_at).toLocaleDateString("en-US",{month:"long",year:"numeric"});
  const pnl = simStats ? simStats.balance - (simStats.start_balance||10000) : 0;
  const wr = simStats?.total_trades > 0 ? (simStats.wins/simStats.total_trades*100).toFixed(0) : null;

  return (
    <html><head>
      <title>@{profile.username} · TraderHub</title>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <meta property="og:title" content={`@${profile.username} on TraderHub`}/>
      <meta property="og:description" content={profile.bio||`Trader on TraderHub`}/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0}body{font-family:monospace;background:#060a0f;color:#f0f6fc;min-height:100vh}.card{background:linear-gradient(160deg,#0f1520,#0b1017);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:20px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.stat{background:rgba(255,255,255,0.03);border-radius:10px;padding:12px;text-align:center}.label{font-size:9px;color:#4b5563;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}`}</style>
    </head><body>
      <div style={{maxWidth:640,margin:"0 auto",padding:"40px 20px"}}>
        <div style={{display:"flex",alignItems:"center",gap:18,marginBottom:24}}>
          <div style={{width:72,height:72,borderRadius:"50%",background:color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,fontWeight:900,color:"#000",boxShadow:`0 0 30px rgba(${rgb},.4)`,flexShrink:0}}>{initials}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:22,fontWeight:900,letterSpacing:"-.03em"}}>{profile.display_name||profile.username}</div>
            <div style={{fontSize:14,color,marginTop:2}}>@{profile.username}</div>
            <div style={{fontSize:11,color:"#4b5563",marginTop:4}}>Member since {since}{profile.twitter&&<> · <a href={`https://twitter.com/${profile.twitter}`} style={{color:"#1d9bf0"}}>@{profile.twitter}</a></>}</div>
          </div>
          <a href="https://traderhub-nine.vercel.app" style={{padding:"8px 16px",borderRadius:10,background:`rgba(${rgb},.1)`,border:`1px solid ${color}40`,color,fontSize:12,fontWeight:700,textDecoration:"none",flexShrink:0}}>TraderHub</a>
        </div>

        {profile.bio&&<div className="card" style={{marginBottom:16,fontSize:14,color:"#c9d1d9",lineHeight:1.7}}>{profile.bio}</div>}

        {profile.show_real_stats&&simStats ? (
          <div className="card" style={{marginBottom:16}}>
            <div className="label" style={{marginBottom:12}}>Simulator Stats · {simStats.account_name}</div>
            <div className="grid">
              <div className="stat"><div className="label">Net P&L</div><div style={{fontSize:18,fontWeight:900,color:pnl>=0?"#00e676":"#ff1744"}}>{pnl>=0?"+":"-"}${Math.abs(pnl).toLocaleString()}</div></div>
              <div className="stat"><div className="label">Win Rate</div><div style={{fontSize:18,fontWeight:900,color:parseFloat(wr||"0")>=50?"#00e676":"#ff1744"}}>{wr}%</div></div>
              <div className="stat"><div className="label">Trades</div><div style={{fontSize:18,fontWeight:900,color:"#00e5ff"}}>{simStats.total_trades}</div></div>
              <div className="stat"><div className="label">Balance</div><div style={{fontSize:18,fontWeight:900,color:"#f0f6fc"}}>${simStats.balance.toLocaleString()}</div></div>
            </div>
          </div>
        ) : (
          <div className="card" style={{marginBottom:16,textAlign:"center",color:"#4b5563",padding:"24px 20px"}}>🔒 Stats private</div>
        )}

        <div style={{textAlign:"center",paddingTop:24,borderTop:"1px solid rgba(255,255,255,0.05)"}}>
          <div style={{fontSize:11,color:"#4b5563",marginBottom:12}}>Track your trading with TraderHub</div>
          <a href="https://traderhub-nine.vercel.app" style={{display:"inline-block",padding:"12px 28px",borderRadius:12,background:`linear-gradient(135deg,${color},${color}99)`,color:"#000",fontSize:13,fontWeight:900,textDecoration:"none"}}>Join Free -</a>
        </div>
      </div>
    </body></html>
  );
}
