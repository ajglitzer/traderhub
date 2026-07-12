"use client";
import React from "react";

interface State { error: Error | null }

/**
 * Catches render errors so one bad component can't blank the entire site.
 * Without this, a single undefined field anywhere crashes everything.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[TraderHub] render error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

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
            The page hit an error. Reloading usually fixes it. If it keeps
            happening, resetting local data will clear any corrupted state.
          </div>

          <pre style={{
            fontSize: 10, color: "#6b7280", background: "rgba(0,0,0,0.4)",
            padding: 10, borderRadius: 8, textAlign: "left", overflow: "auto",
            maxHeight: 90, marginBottom: 18,
          }}>{String(this.state.error?.message ?? this.state.error)}</pre>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                flex: 1, padding: "12px", borderRadius: 10, border: "none",
                background: "linear-gradient(135deg,#00e5ff,#0088bb)",
                color: "#000", fontWeight: 800, fontSize: 13, cursor: "pointer",
              }}>
              Reload
            </button>
            <button
              onClick={() => {
                try {
                  // Clear only TraderHub keys, not the whole origin
                  const kill: string[] = [];
                  for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && (k.startsWith("tv-") || k.startsWith("th_") || k.startsWith("traderhub"))) {
                      kill.push(k);
                    }
                  }
                  kill.forEach(k => localStorage.removeItem(k));
                } catch {}
                window.location.reload();
              }}
              style={{
                flex: 1, padding: "12px", borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.04)",
                color: "#6b7280", fontSize: 13, cursor: "pointer",
              }}>
              Reset data
            </button>
          </div>
        </div>
      </div>
    );
  }
}
