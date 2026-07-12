"use client";
import { useState, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/components/auth/auth-provider";

export type SubStatus = "active" | "trialing" | "canceled" | "none" | "loading";

export interface SubInfo {
  status: SubStatus;
  plan: "monthly" | "annual" | null;
  periodEnd: string | null;
  isPro: boolean;
}

const LOADING: SubInfo = { status: "loading", plan: null, periodEnd: null, isPro: false };
const FREE:    SubInfo = { status: "none",    plan: null, periodEnd: null, isPro: false };

// ── Module-level store ────────────────────────────────────────────────────────
// Without a shared store, every component using this hook fires its own request.
// With 50 trade rows (each has a chart + AI button) that's 100+ API calls.
let snapshot: SubInfo = LOADING;
let cachedUserId: string | null = null;
let inflight: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function subscribe(cb: () => void) {
  subscribers.add(cb);
  return () => { subscribers.delete(cb); };
}

function getSnapshot(): SubInfo {
  return snapshot;
}

function setSnapshot(next: SubInfo) {
  if (snapshot === next) return;
  snapshot = next;
  subscribers.forEach(cb => cb());
}

function ensureFetched(userId: string) {
  if (cachedUserId === userId && snapshot.status !== "loading") return;
  if (inflight) return;

  inflight = (async () => {
    try {
      const r = await fetch("/api/subscription/status");
      const d = await r.json();
      cachedUserId = userId;
      setSnapshot({
        status: d.status ?? "none",
        plan: d.plan ?? null,
        periodEnd: d.periodEnd ?? null,
        isPro: d.status === "active" || d.status === "trialing",
      });
    } catch {
      cachedUserId = userId;
      setSnapshot(FREE);
    } finally {
      inflight = null;
    }
  })();
}

/** Call after a successful checkout to force a re-check. */
export function invalidateSubscription() {
  cachedUserId = null;
  inflight = null;
  setSnapshot(LOADING);
}

export function useSubscription(): SubInfo {
  const { user, loading: authLoading } = useAuth();

  // One shared snapshot across every hook instance — no per-component state,
  // so no render storm when the value resolves.
  const info = useSyncExternalStore(subscribe, getSnapshot, () => LOADING);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      cachedUserId = null;
      setSnapshot(FREE);
      return;
    }

    if (cachedUserId && cachedUserId !== user.id) {
      cachedUserId = null;
      inflight = null;
      setSnapshot(LOADING);
    }

    ensureFetched(user.id);
  }, [user, authLoading]);

  return info;
}
