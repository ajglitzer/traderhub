"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{
      minHeight: "100vh", background: "#060a0f", color: "#c9d1d9",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        maxWidth: 460, width: "100%", textAlign: "center",
        background: "linear-gradient(160deg,#0f1520,#0b1017)",
        border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: 18, padding: 32,
      }}>
        <div style={{ fontSize: 40, marginBottom: 14 }}>⚠️</div>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#f0f6fc", marginBottom: 8 }}>
          Something went wrong
        </div>
        <div style={{ fontSize: 12, color: "#4b5563", marginBottom: 22, lineHeight: 1.6 }}>
          The page hit an error. Try again — if it keeps happening, reload the page.
        </div>

        <pre style={{
          fontSize: 10, color: "#6b7280", background: "rgba(0,0,0,0.4)",
          padding: 10, borderRadius: 8, textAlign: "left", overflow: "auto",
          maxHeight: 90, marginBottom: 18,
        }}>{error?.message ?? String(error)}</pre>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => reset()}
            style={{
              flex: 1, padding: "12px", borderRadius: 10, border: "none",
              background: "linear-gradient(135deg,#00e5ff,#0088bb)",
              color: "#000", fontWeight: 800, fontSize: 13, cursor: "pointer",
            }}>
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              flex: 1, padding: "12px", borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.04)",
              color: "#6b7280", fontSize: 13, cursor: "pointer",
            }}>
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
