"use client";

function timeUntilResetUTC(): string {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  const diffMs = next.getTime() - now.getTime();
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

/** Inline "limit reached" card — same visual language as PricingModal. Only Pro users
 * ever see this (Free is blocked earlier by the Pro gate itself), so there's no
 * upgrade CTA here — just the daily reset. */
export function AiLimitGate({ limit = 20, onClose }: { limit?: number; onClose: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}>
      <div style={{
        width: "100%", maxWidth: 420,
        background: "linear-gradient(160deg,#0f1520,#0b1017)",
        border: "1px solid rgba(213,0,249,0.2)",
        borderRadius: 20, padding: 32,
        boxShadow: "0 0 60px rgba(213,0,249,0.08)",
        textAlign: "center" as const,
      }}>
        <div style={{
          width: 56, height: 56, margin: "0 auto 18px", borderRadius: 16,
          background: "rgba(213,0,249,0.1)", border: "1px solid rgba(213,0,249,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 20px rgba(213,0,249,0.15)",
        }}>
          <svg width="24" height="24" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1L7.5 5.5L12 6.5L7.5 7.5L6.5 12L5.5 7.5L1 6.5L5.5 5.5L6.5 1Z" fill="#d500f9" />
          </svg>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: "#d500f9", letterSpacing: "0.12em", textTransform: "uppercase" as const, marginBottom: 8 }}>
          Daily AI Limit
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#f0f6fc", letterSpacing: "-0.02em" }}>
          You've used today's {limit} AI analyses
        </div>
        <div style={{ fontSize: 13, color: "#4b5563", marginTop: 8, lineHeight: 1.6 }}>
          Your Pro plan includes {limit} AI analyses per day to keep things fast for everyone.
        </div>

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          background: "rgba(213,0,249,0.06)", border: "1px solid rgba(213,0,249,0.15)",
          borderRadius: 12, padding: "12px 16px", marginTop: 20,
        }}>
          <span style={{ fontSize: 18, fontWeight: 900, color: "#d500f9", fontFamily: "monospace" }}>{limit}/{limit}</span>
          <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.1)" }} />
          <span style={{ fontSize: 12, color: "#8b949e" }}>used today</span>
        </div>

        <div style={{ fontSize: 12, color: "#4b5563", marginTop: 14 }}>
          🕛 Resets at midnight UTC · in {timeUntilResetUTC()}
        </div>

        <button onClick={onClose} style={{
          marginTop: 22, height: 38, padding: "0 24px", borderRadius: 9, border: "none",
          background: "linear-gradient(135deg,#d500f9,#8800bb)", color: "#fff",
          fontSize: 13, fontWeight: 800, cursor: "pointer",
        }}>
          Got it
        </button>
      </div>
    </div>
  );
}
