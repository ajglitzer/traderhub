"use client";
import { boldOnly } from "@/lib/safe-markdown";
import { PricingModal } from "@/components/subscription/pro-gate";
import { useSubscription } from "@/hooks/useSubscription";
import { useState, useRef, useEffect } from "react";

interface Trade {
  ticker: string;
  side: string;
  assetClass: string;
  entryPrice: number;
  exitPrice?: number | null;
  quantity: number;
  entryTime: string;
  exitTime?: string | null;
  netPnl?: number | null;
  grossPnl?: number | null;
  rMultiple?: number | null;
  holdTimeSeconds?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  strategy?: string | null;
  notes?: string | null;
}

interface Props {
  trade: Record<string, any>;
  onClose: () => void;
}

const f$ = (n: number) =>
  (n >= 0 ? "+" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fP = (n: number) => n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(4) : n.toFixed(6);
const fHold = (s: number | null) => {
  if (!s) return "—";
  if (s < 60) return s + "s";
  if (s < 3600) return Math.round(s / 60) + "m";
  if (s < 86400) return (s / 3600).toFixed(1) + "h";
  return (s / 86400).toFixed(1) + "d";
};

function buildPrompt(t: Record<string, any>): string {
  const isPos = (t.netPnl ?? 0) >= 0;
  const pnlPts = t.netPnl && t.assetClass === "FUTURES"
    ? ` (${((t.exitPrice ?? 0) - t.entryPrice).toFixed(2)} pts)`
    : "";
  const rr = t.stopLoss && t.takeProfit
    ? `\n- Stop Loss: $${fP(t.stopLoss)}\n- Take Profit: $${fP(t.takeProfit)}\n- R:R ratio: ${Math.abs((t.takeProfit - t.entryPrice) / (t.entryPrice - t.stopLoss)).toFixed(2)}`
    : t.stopLoss ? `\n- Stop Loss: $${fP(t.stopLoss)} (no TP set)` : "";
  return `You are a professional trading coach analyzing a trade. Be direct, specific, and honest. Do not hedge every statement. Give real actionable feedback.

TRADE DATA:
- Instrument: ${t.ticker} (${t.assetClass})
- Direction: ${t.side}
- Entry: $${fP(t.entryPrice)} at ${t.entryTime ? new Date(t.entryTime).toLocaleString() : "unknown"}
- Exit: ${t.exitPrice ? "$" + fP(t.exitPrice) : "still open"} ${t.exitTime ? "at " + new Date(t.exitTime).toLocaleString() : ""}
- Quantity: ${t.quantity} contract${t.quantity !== 1 ? "s" : ""}
- Net P&L: ${t.netPnl != null ? f$(t.netPnl) + pnlPts : "N/A"}
- Hold time: ${fHold(t.holdTimeSeconds ?? null)}
- R-multiple: ${t.rMultiple != null ? t.rMultiple.toFixed(2) + "R" : "no risk defined"}${rr}
- Strategy tag: ${t.strategy || "none"}
- Notes: ${t.notes || "none"}

Provide a structured analysis in exactly this format:

## Verdict
One sentence: was this a good trade execution? (separate from outcome)

## What Went Well
2-3 bullet points of specific positives (if any). Be honest — if nothing went well, say so.

## What Went Wrong
2-3 bullet points of specific negatives. Be honest and direct.

## Entry Analysis
Was the entry price good? Was the timing reasonable? What does the hold time suggest?

## Exit Analysis
Was the exit well-managed? Was profit left on the table, or did they cut losses appropriately?

## Risk Management
Evaluate position sizing, stop placement (if any), R:R ratio. Grade it: Poor / Fair / Good / Excellent.

## Key Takeaway
One specific, actionable thing to do differently on the next similar trade.`;
}

export function AIAnalysisBtn({ trade, size = 28 }: { trade: Record<string, any>; size?: number }) {
  const [open, setOpen] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const { isPro, status } = useSubscription();
  return (
    <>
      <button
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        title="AI trade analysis"
        style={{
          width: size, height: size, borderRadius: 7,
          background: "rgba(213,0,249,0.08)",
          border: "1px solid rgba(213,0,249,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", flexShrink: 0, transition: "all 0.12s",
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = "rgba(213,0,249,0.18)";
          el.style.borderColor = "rgba(213,0,249,0.5)";
          el.style.boxShadow = "0 0 12px rgba(213,0,249,0.3)";
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = "rgba(213,0,249,0.08)";
          el.style.borderColor = "rgba(213,0,249,0.25)";
          el.style.boxShadow = "none";
        }}
      >
        {/* Sparkle/AI icon */}
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M6.5 1L7.5 5.5L12 6.5L7.5 7.5L6.5 12L5.5 7.5L1 6.5L5.5 5.5L6.5 1Z" fill="#d500f9" fillOpacity="0.9"/>
        </svg>
      </button>
      {open && <AIAnalysisPopup trade={trade} onClose={() => setOpen(false)} />}
    </>
  );
}

function AIAnalysisPopup({ trade, onClose }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "streaming" | "done" | "error">("idle");
  const [text, setText] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const isPos = (trade.netPnl ?? 0) >= 0;

  // Auto-start analysis on mount
  useEffect(() => { startAnalysis(); }, []);

  // Auto-scroll as text streams in
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [text]);

  const startAnalysis = async () => {
    setStatus("loading"); setText(""); setErrMsg("");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: buildPrompt(trade) }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }
      if (!res.body) throw new Error("No response body");

      setStatus("streaming");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const j = JSON.parse(data);
            // Groq/OpenAI format
            const delta1 = j?.choices?.[0]?.delta?.content || "";
            // Anthropic format (content_block_delta)
            const delta2 = (j?.type === "content_block_delta" && j?.delta?.type === "text_delta") ? (j?.delta?.text || "") : "";
            const delta = delta1 || delta2;
            if (delta) setText(t => t + delta);
          } catch {}
        }
      }
      setStatus("done");
    } catch (e) {
      setErrMsg(String(e));
      setStatus("error");
    }
  };

  // Simple markdown renderer - handles ##, **, bullets
  const renderMd = (md: string) => {
    return md.split("\n").map((line, i) => {
      if (line.startsWith("## ")) {
        return <div key={i} style={{ fontSize: 12, fontWeight: 800, color: "#d500f9", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginTop: 18, marginBottom: 6 }}>{line.slice(3)}</div>;
      }
      if (line.startsWith("- ") || line.startsWith("• ")) {
        const content = line.slice(2).replace(/\*\*(.*?)\*\*/g, "$1");
        return (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, paddingLeft: 4 }}>
            <span style={{ color: "#d500f9", flexShrink: 0, marginTop: 1 }}>▸</span>
            <span style={{ fontSize: 13, color: "#c9d1d9", lineHeight: 1.6 }}
              dangerouslySetInnerHTML={{ __html: boldOnly(line.slice(2)) }}
            />
          </div>
        );
      }
      if (line.trim() === "") return <div key={i} style={{ height: 6 }} />;
      return (
        <p key={i} style={{ fontSize: 13, color: "#c9d1d9", lineHeight: 1.7, marginBottom: 4 }}
          dangerouslySetInnerHTML={{ __html: boldOnly(line) }}
        />
      );
    });
  };

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        width: "100%", maxWidth: 620,
        background: "linear-gradient(160deg,#0f1520,#0b1017)",
        border: "1px solid rgba(213,0,249,0.2)",
        borderRadius: 20, overflow: "hidden",
        boxShadow: "0 0 80px rgba(213,0,249,0.1), 0 0 120px rgba(0,0,0,0.9), 0 0 1px rgba(213,0,249,0.3) inset",
        display: "flex", flexDirection: "column", maxHeight: "85vh",
      }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.3)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* AI icon */}
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(213,0,249,0.1)", border: "1px solid rgba(213,0,249,0.3)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 16px rgba(213,0,249,0.15)" }}>
              <svg width="16" height="16" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1L7.5 5.5L12 6.5L7.5 7.5L6.5 12L5.5 7.5L1 6.5L5.5 5.5L6.5 1Z" fill="#d500f9"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#f0f6fc" }}>AI Trade Analysis</div>
              <div style={{ fontSize: 10, color: "#4b5563", marginTop: 1 }}>Powered by Groq · Free</div>
            </div>
            <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.07)" }} />
            {/* Trade summary */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace", color: "#f0f6fc" }}>{trade.ticker}</span>
              <span style={{ padding: "1px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: trade.side === "LONG" ? "rgba(0,230,118,0.1)" : "rgba(255,23,68,0.1)", color: trade.side === "LONG" ? "#00e676" : "#ff1744" }}>{trade.side}</span>
              {trade.netPnl != null && (
                <span style={{ fontSize: 12, fontWeight: 800, fontFamily: "monospace", color: isPos ? "#00e676" : "#ff1744" }}>{f$(trade.netPnl)}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#4b5563", cursor: "pointer", fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)"; (e.currentTarget as HTMLElement).style.color = "#c9d1d9"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; (e.currentTarget as HTMLElement).style.color = "#4b5563"; }}>×</button>
        </div>

        {/* Content */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "18px 22px", minHeight: 0 }}>
          {status === "loading" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 0", gap: 14 }}>
              <div style={{ position: "relative", width: 48, height: 48 }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", border: "2px solid rgba(213,0,249,0.15)", borderTop: "2px solid #d500f9", animation: "spin 0.8s linear infinite" }} />
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="16" height="16" viewBox="0 0 13 13" fill="none"><path d="M6.5 1L7.5 5.5L12 6.5L7.5 7.5L6.5 12L5.5 7.5L1 6.5L5.5 5.5L6.5 1Z" fill="#d500f9" opacity="0.7"/></svg>
                </div>
              </div>
              <span style={{ fontSize: 13, color: "#4b5563" }}>Analyzing your trade...</span>
            </div>
          )}

          {(status === "streaming" || status === "done") && (
            <div>
              {renderMd(text)}
              {status === "streaming" && (
                <span style={{ display: "inline-block", width: 2, height: 14, background: "#d500f9", marginLeft: 2, animation: "blink 0.8s infinite", verticalAlign: "middle" }} />
              )}
            </div>
          )}

          {status === "error" && (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>⚠️</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#ff1744", marginBottom: 8 }}>Analysis failed</div>
              <pre style={{ fontSize: 11, color: "#4b5563", marginBottom: 16, lineHeight: 1.7, whiteSpace:"pre-wrap" as const, textAlign:"left" as const, background:"rgba(255,255,255,0.03)", borderRadius:8, padding:"10px 12px", maxHeight:200, overflowY:"auto" as const }}>{errMsg}</pre>
              {errMsg.includes("API key") && (
                <div style={{ fontSize: 11, color: "#ffab00", background: "rgba(255,171,0,0.06)", border: "1px solid rgba(255,171,0,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 12, textAlign: "left" as const, lineHeight: 1.7 }}>
                  <strong style={{ color: "#ffab00" }}>Fix:</strong> Add <code style={{ color: "#00e5ff" }}>GROQ_API_KEY</code> to Vercel<br/>
                  Vercel → Your project → Settings → Environment Variables<br/>
                  Get a free key at <strong>console.groq.com/keys</strong>
                </div>
              )}
              <button onClick={startAnalysis} style={{ height: 32, padding: "0 18px", borderRadius: 8, background: "rgba(213,0,249,0.1)", border: "1px solid rgba(213,0,249,0.3)", color: "#d500f9", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Retry</button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.25)", flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: "#374151" }}>
            {status === "streaming" ? "Analyzing..." : status === "done" ? "Analysis complete" : ""}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {status === "done" && (
              <button onClick={startAnalysis} style={{ height: 28, padding: "0 12px", borderRadius: 7, border: "1px solid rgba(213,0,249,0.25)", background: "rgba(213,0,249,0.08)", color: "#d500f9", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                Re-analyze
              </button>
            )}
            <button onClick={onClose} style={{ height: 28, padding: "0 14px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "#6b7280", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Close</button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0; } }
      `}</style>
    </div>
  );
}
