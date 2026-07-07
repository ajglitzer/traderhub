"use client";
import { useState, useEffect } from "react";
import { getGlobalLeaderboard } from "@/lib/social";

interface LBEntry { username: string; account_name: string; balance: number; start_balance: number; trades: number; wins: number; updated_at: string; }

export default function LeaderboardPage({ myUserId }: { myUserId?: string }) {
  const [entries, setEntries] = useState<LBEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"return"|"balance"|"winrate">("return");

  useEffect(() => {
    getGlobalLeaderboard().then(e => { setEntries(e); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const sorted = [...entries].sort((a, b) => {
    if (tab === "return") return ((b.balance - b.start_balance) / b.start_balance) - ((a.balance - a.start_balance) / a.start_balance);
    if (tab === "balance") return b.balance - a.balance;
    const awr = a.trades > 0 ? a.wins / a.trades : 0;
    const bwr = b.trades > 0 ? b.wins / b.trades : 0;
    return bwr - awr;
  });

  const medals = ["🥇","🥈","🥉"];

  return (
    <div style={{ padding:20, overflowY:"auto", height:"100%", display:"flex", flexDirection:"column", gap:14 }}>
      <div>
        <h2 style={{ fontSize:16, fontWeight:800, color:"#f0f6fc", margin:0 }}>Leaderboard</h2>
        <p style={{ fontSize:11, color:"#4b5563", margin:"2px 0 0" }}>Global sim account rankings</p>
      </div>

      <div style={{ display:"flex", gap:8 }}>
        {(["return","balance","winrate"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ height:28, padding:"0 14px", borderRadius:20, border:"1px solid", fontSize:11, fontWeight:700, cursor:"pointer",
            borderColor: tab===t ? "rgba(0,229,255,0.4)" : "rgba(255,255,255,0.08)",
            background:  tab===t ? "rgba(0,229,255,0.1)" : "rgba(255,255,255,0.03)",
            color:       tab===t ? "#00e5ff" : "#4b5563",
          }}>{t === "return" ? "% Return" : t === "balance" ? "Balance" : "Win Rate"}</button>
        ))}
      </div>

      {loading && <div style={{ display:"flex", justifyContent:"center", padding:40 }}><div style={{ width:32,height:32,borderRadius:"50%",border:"2px solid rgba(0,229,255,0.15)",borderTop:"2px solid #00e5ff",animation:"spin 0.8s linear infinite" }}/><style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style></div>}

      {!loading && sorted.length === 0 && (
        <div style={{ textAlign:"center", padding:40, color:"#4b5563" }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🏆</div>
          <div style={{ fontSize:14, fontWeight:700, color:"#f0f6fc" }}>No entries yet</div>
          <div style={{ fontSize:12, marginTop:4 }}>Complete sim trades to appear on the leaderboard</div>
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        {sorted.slice(0, 50).map((e, i) => {
          const ret = ((e.balance - e.start_balance) / e.start_balance) * 100;
          const wr = e.trades > 0 ? (e.wins / e.trades * 100) : 0;
          const isMe = false; // could check by username
          return (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background: isMe ? "rgba(0,229,255,0.06)" : "linear-gradient(160deg,#0f1520,#0b1017)", border:`1px solid ${isMe ? "rgba(0,229,255,0.2)" : "rgba(255,255,255,0.06)"}`, borderRadius:12 }}>
              <div style={{ width:28, textAlign:"center", fontSize: i < 3 ? 20 : 13, color:"#4b5563", fontWeight:700 }}>{i < 3 ? medals[i] : `#${i+1}`}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#f0f6fc" }}>@{e.username}</div>
                <div style={{ fontSize:10, color:"#4b5563" }}>{e.account_name} · {e.trades} trades</div>
              </div>
              <div style={{ textAlign:"right" as const }}>
                <div style={{ fontSize:14, fontWeight:800, color: ret >= 0 ? "#00e676" : "#ff1744", fontFamily:"monospace" }}>{ret >= 0 ? "+" : ""}{ret.toFixed(1)}%</div>
                <div style={{ fontSize:10, color:"#4b5563" }}>${e.balance.toLocaleString()} · {wr.toFixed(0)}% WR</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
