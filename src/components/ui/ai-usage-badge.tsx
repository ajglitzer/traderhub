"use client";
import { useEffect, useState } from "react";
import { useSubscription } from "@/hooks/useSubscription";

/** Small pill showing today's AI usage (e.g. "7/20 AI uses today").
 * Only ever meaningful for Pro users — Free is blocked from AI entirely
 * by the Pro gate on /api/analyze, so this renders nothing for them. */
export function AiUsageBadge({ color = "#00e5ff" }: { color?: string }) {
  const { isPro } = useSubscription();
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);

  useEffect(() => {
    if (!isPro) return;
    let dead = false;
    fetch("/api/ai-usage")
      .then(r => r.json())
      .then(d => { if (!dead && typeof d.used === "number") setUsage({ used: d.used, limit: d.limit }); })
      .catch(() => {});
    return () => { dead = true; };
  }, [isPro]);

  if (!isPro || !usage) return null;
  const atLimit = usage.used >= usage.limit;

  return (
    <div title="Resets at midnight UTC" style={{
      display:"flex", alignItems:"center", gap:6, height:26, padding:"0 10px", borderRadius:20,
      background: atLimit ? "rgba(255,23,68,0.08)" : `${color}14`,
      border: `1px solid ${atLimit ? "rgba(255,23,68,0.25)" : color+"33"}`,
      fontSize:11, fontWeight:700, color: atLimit ? "#ff1744" : color, flexShrink:0, whiteSpace:"nowrap" as const,
    }}>
      <span style={{ width:5, height:5, borderRadius:"50%", background: atLimit ? "#ff1744" : color, flexShrink:0 }}/>
      {usage.used}/{usage.limit} AI uses today
    </div>
  );
}
