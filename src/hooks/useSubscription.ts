"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";

export type SubStatus = "active" | "trialing" | "canceled" | "none" | "loading";

export interface SubInfo {
  status: SubStatus;
  plan: "monthly" | "annual" | null;
  periodEnd: string | null;
  isPro: boolean;
}

const LOADING: SubInfo = { status: "loading", plan: null, periodEnd: null, isPro: false };
const FREE: SubInfo = { status: "none", plan: null, periodEnd: null, isPro: false };

// ── Module-level cache ────────────────────────────────────────────────────────
// Without this, every component using this hook fires its own API request.
// With 50 trade rows (each with a chart + AI button) that's 100+ calls.
let cache: { userId: string; data: SubInfo } | null = null;
let inflight: Promise<SubInfo> | null = null;
const listeners = new Set<(s: SubInfo) => void>();

function broadcast(data: SubInfo) {
  listeners.forEach(fn => fn(data));
}

async function fetchStatus(userId: string): Promise<SubInfo> {
  // Return cached result if we already have it for this user
  if (cache && cache.userId === userId) return cache.data;
  // Dedupe concurrent requests — all callers share one fetch
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const r = await fetch("/api/subscription/status");
      const d = await r.json();
      const info: SubInfo = {
        status: d.status ?? "none",
        plan: d.plan ?? null,
        periodEnd: d.periodEnd ?? null,
        isPro: d.status === "active" || d.status === "trialing",
      };
      cache = { userId, data: info };
      broadcast(info);
      return info;
    } catch {
      cache = { userId, data: FREE };
      broadcast(FREE);
      return FREE;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Call after a successful checkout to force a re-check. */
export function invalidateSubscription() {
  cache = null;
  inflight = null;
}

export function useSubscription(): SubInfo {
  const { user, loading: authLoading } = useAuth();
  const [info, setInfo] = useState<SubInfo>(() => {
    if (cache && user && cache.userId === user.id) return cache.data;
    return LOADING;
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) { cache = null; setInfo(FREE); return; }

    // Clear cache if the user changed
    if (cache && cache.userId !== user.id) cache = null;

    // Subscribe to updates so all hook instances stay in sync
    listeners.add(setInfo);
    fetchStatus(user.id).then(setInfo);

    return () => { listeners.delete(setInfo); };
  }, [user, authLoading]);

  return info;
}
