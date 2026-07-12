"use client";

// Safe number formatter — prevents the site-crashing undefined.toFixed() error
function sf(n: unknown, d = 2): string {
  const v = typeof n === "number" ? n : parseFloat(String(n ?? ""));
  return Number.isFinite(v) ? v.toFixed(d) : "0";
}
import { useEffect, useRef, useState } from "react";
import { Trade } from "@/types/trade";
import { createPortal } from "react-dom";

interface Props { trade: Trade; username?: string; onClose: () => void; }

function drawMiniChart(canvas: HTMLCanvasElement, candles: {o:number;h:number;l:number;c:number;t:number}[], entryTime: number, exitTime: number, side: string) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth, H = canvas.offsetHeight;
  if (!W || !H) return;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#0a0f1a";
  ctx.fillRect(0, 0, W, H);
  if (!candles.length) return;
  const lo = Math.min(...candles.map(c => c.l));
  const hi = Math.max(...candles.map(c => c.h));
  const pad = (hi - lo) * 0.1;
  const toY = (p: number) => H - ((p - lo + pad) / (hi - lo + pad * 2)) * H;
  const bw = W / candles.length;
  candles.forEach((c, i) => {
    const x = i * bw + bw / 2;
    const bull = c.c >= c.o;
    ctx.strokeStyle = bull ? "#00e676" : "#ff1744";
    ctx.fillStyle = bull ? "#00e676" : "#ff1744";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, toY(c.h)); ctx.lineTo(x, toY(c.l)); ctx.stroke();
    const cy = toY(Math.max(c.o, c.c));
    const ch = Math.max(2, Math.abs(toY(c.o) - toY(c.c)));
    ctx.fillRect(x - bw * 0.35, cy, bw * 0.7, ch);
  });
  // Entry arrow
  const entryIdx = candles.findIndex(c => c.t >= entryTime);
  if (entryIdx >= 0) {
    const x = entryIdx * bw + bw / 2;
    const entryC = candles[entryIdx];
    ctx.fillStyle = "#00e5ff";
    ctx.font = "bold 14px monospace";
    if (side === "LONG") {
      ctx.fillText("▲", x - 6, toY(entryC.l) + 16);
    } else {
      ctx.fillText("▼", x - 6, toY(entryC.h) - 6);
    }
  }
  // Exit arrow
  const exitIdx = candles.findIndex(c => c.t >= exitTime);
  if (exitIdx >= 0) {
    const x = exitIdx * bw + bw / 2;
    const exitC = candles[exitIdx];
    ctx.fillStyle = "#ff6b35";
    ctx.font = "bold 14px monospace";
    if (side === "LONG") {
      ctx.fillText("▼", x - 6, toY(exitC.h) - 6);
    } else {
      ctx.fillText("▲", x - 6, toY(exitC.l) + 16);
    }
  }
}

async function fetchMiniCandles(ticker: string, entryTime: string, exitTime: string) {
  try {
    const from = Math.floor(new Date(entryTime).getTime() / 1000) - 1800;
    const to = Math.floor(new Date(exitTime).getTime() / 1000) + 1800;
    // Convert common ticker formats to Yahoo Finance symbols
    const symMap: Record<string,string> = {
      "NQ1!":"NQ=F", "NQ":"NQ=F", "CME_MINI:NQ1!":"NQ=F",
      "ES1!":"ES=F", "ES":"ES=F", "CME_MINI:ES1!":"ES=F",
      "YM1!":"YM=F", "YM":"YM=F", "CBOT_MINI:YM1!":"YM=F",
      "CL1!":"CL=F", "CL":"CL=F", "NYMEX:CL1!":"CL=F",
      "GC1!":"GC=F", "GC":"GC=F", "COMEX:GC1!":"GC=F",
      "MGC1!":"MGC=F", "MGC":"MGC=F",
      "MES1!":"MES=F", "MES":"MES=F",
      "MNQ1!":"MNQ=F", "MNQ":"MNQ=F",
    };
    // Strip exchange prefix for lookup
    const stripped = ticker.replace(/^[A-Z_]+:/, "");
    const sym = symMap[ticker] || symMap[stripped] || stripped;
    const r = await fetch(`/api/chart?sym=${encodeURIComponent(sym)}&from=${from}&to=${to}`);
    if (!r.ok) return [];
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    if (!res) return [];
    const ts: number[] = res.timestamp || [];
    const q = res.indicators?.quote?.[0] || {};
    return ts.map((t, i) => ({ t, o: q.open?.[i] || 0, h: q.high?.[i] || 0, l: q.low?.[i] || 0, c: q.close?.[i] || 0 }))
      .filter(c => c.o > 0 && isFinite(c.o));
  } catch { return []; }
}

export function TradeCardModal({ trade, username, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [candles, setCandles] = useState<{o:number;h:number;l:number;c:number;t:number}[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isWin = (trade.netPnl ?? 0) >= 0;
  const pts = trade.entryPrice && trade.exitPrice
    ? Math.abs(trade.exitPrice - trade.entryPrice).toFixed(2)
    : "—";

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!trade.entryTime || !trade.exitTime) return;
    fetchMiniCandles(trade.ticker, trade.entryTime, trade.exitTime).then(setCandles);
  }, [trade]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !candles.length) return;
    const entryTs = Math.floor(new Date(trade.entryTime || "").getTime() / 1000);
    const exitTs = Math.floor(new Date(trade.exitTime || "").getTime() / 1000);
    requestAnimationFrame(() => drawMiniChart(canvas, candles, entryTs, exitTs, trade.side || "LONG"));
  }, [candles, trade]);

  const download = async () => {
    setDownloading(true);
    try {
      const { default: html2canvas } = await import("html2canvas");
      const card = cardRef.current;
      if (!card) return;
      const canvas = await html2canvas(card, { backgroundColor: null, scale: 2, useCORS: true, logging: false });
      const link = document.createElement("a");
      link.download = `traderhub-${trade.ticker}-${isWin ? "win" : "loss"}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) { console.error(e); }
    setDownloading(false);
  };

  const card = (
    <div ref={cardRef} style={{
      width: 400, background: isWin
        ? "linear-gradient(135deg,#0a1a0f,#061210,#0a1a1a)"
        : "linear-gradient(135deg,#1a0a0a,#120606,#1a0a10)",
      borderRadius: 20, padding: 24, fontFamily: "monospace",
      border: `1px solid ${isWin ? "rgba(0,230,118,0.3)" : "rgba(255,23,68,0.3)"}`,
      boxShadow: isWin ? "0 0 60px rgba(0,230,118,0.15)" : "0 0 60px rgba(255,23,68,0.15)",
      position: "relative" as const, overflow: "hidden",
    }}>
      {/* Glow bg */}
      <div style={{ position:"absolute", top:-60, right:-60, width:200, height:200, borderRadius:"50%", background: isWin ? "rgba(0,230,118,0.06)" : "rgba(255,23,68,0.06)", filter:"blur(40px)", pointerEvents:"none" }}/>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ fontSize:18, fontWeight:900, color:"#f0f6fc", letterSpacing:"-0.02em" }}>{trade.ticker}</div>
          <div style={{ padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:800,
            background: trade.side === "LONG" ? "rgba(0,230,118,0.15)" : "rgba(255,23,68,0.15)",
            color: trade.side === "LONG" ? "#00e676" : "#ff1744",
            border: `1px solid ${trade.side === "LONG" ? "rgba(0,230,118,0.3)" : "rgba(255,23,68,0.3)"}` }}>
            {trade.side === "LONG" ? "▲ LONG" : "▼ SHORT"}
          </div>
        </div>
        <div style={{ fontSize:10, color:"#4b5563" }}>{trade.entryTime ? new Date(trade.entryTime).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : ""}</div>
      </div>

      {/* PnL */}
      <div style={{ textAlign:"center" as const, marginBottom:16 }}>
        <div style={{ fontSize:48, fontWeight:900, letterSpacing:"-0.04em", color: isWin ? "#00e676" : "#ff1744", lineHeight:1 }}>
          {isWin ? "+" : "-"}${Math.abs(trade.netPnl ?? 0).toFixed(2)}
        </div>
        <div style={{ fontSize:13, color:"#4b5563", marginTop:4 }}>{pts} pts · {trade.quantity || 1} contract{(trade.quantity || 1) > 1 ? "s" : ""}</div>
      </div>

      {/* Mini chart */}
      <div style={{ borderRadius:12, overflow:"hidden", marginBottom:16, background:"#0a0f1a", border:"1px solid rgba(255,255,255,0.06)", height:120, position:"relative" as const }}>
        {candles.length > 0
          ? <canvas ref={canvasRef} style={{ width:"100%", height:"100%", display:"block" }}/>
          : <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:"#3d4551", fontSize:11 }}>Chart loading...</div>
        }
      </div>

      {/* Stats row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:16 }}>
        {[
          ["Entry", trade.entryPrice ? `$${sf(trade.entryPrice, 2)}` : "—"],
          ["Exit",  trade.exitPrice  ? `$${sf(trade.exitPrice, 2)}`  : "—"],
          ["Hold",  trade.holdTimeSeconds ? (trade.holdTimeSeconds < 3600 ? `${Math.round(trade.holdTimeSeconds/60)}m` : `${Math.round(trade.holdTimeSeconds/3600)}h`) : "—"],
        ].map(([l, v]) => (
          <div key={l} style={{ background:"rgba(255,255,255,0.03)", borderRadius:10, padding:"8px 12px", textAlign:"center" as const }}>
            <div style={{ fontSize:9, color:"#4b5563", textTransform:"uppercase" as const, letterSpacing:"0.08em", marginBottom:2 }}>{l}</div>
            <div style={{ fontSize:13, fontWeight:800, color:"#e6edf3", fontFamily:"monospace" }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", paddingTop:12, borderTop:"1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ fontSize:11, fontWeight:800, color:"#00e5ff", letterSpacing:"-0.02em" }}>
          Trader<span style={{ color:"#4b5563" }}>Hub</span>
        </div>
        {username && <div style={{ fontSize:11, color:"#4b5563" }}>@{username}</div>}
        <div style={{ fontSize:9, color:"#3d4551" }}>traderhub-nine.vercel.app</div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position:"fixed", inset:0, zIndex:99999, background:"rgba(0,0,0,0.85)", backdropFilter:"blur(12px)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ display:"flex", flexDirection:"column" as const, alignItems:"center", gap:16 }}>
        {card}
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={download} disabled={downloading} style={{ height:40, padding:"0 24px", borderRadius:10, border:"none", background: isWin ? "#00e676" : "#ff1744", color:"#000", fontSize:13, fontWeight:800, cursor:"pointer", opacity: downloading ? 0.7 : 1 }}>
            {downloading ? "Generating..." : "⬇ Download PNG"}
          </button>
          <button onClick={onClose} style={{ height:40, padding:"0 20px", borderRadius:10, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.05)", color:"#6b7280", fontSize:13, cursor:"pointer" }}>Close</button>
        </div>
        <div style={{ fontSize:11, color:"#3d4551" }}>Share on TikTok, X, or Instagram</div>
      </div>
    </div>,
    document.body
  );
}

export function TradeCardBtn({ trade, username }: { trade: Trade; username?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} title="Share trade card" style={{ width:28, height:28, borderRadius:7, border:"1px solid rgba(255,255,255,0.08)", background:"rgba(255,255,255,0.03)", color:"#4b5563", cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>📤</button>
      {open && <TradeCardModal trade={trade} username={username} onClose={() => setOpen(false)}/>}
    </>
  );
}
