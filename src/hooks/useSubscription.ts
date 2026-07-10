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

const DEFAULT: SubInfo = { status: "loading", plan: null, periodEnd: null, isPro: false };

export function useSubscription(): SubInfo {
  const { user } = useAuth();
  const [info, setInfo] = useState<SubInfo>(DEFAULT);

  useEffect(() => {
    if (!user) { setInfo({ ...DEFAULT, status: "none" }); return; }
    fetch("/api/subscription/status")
      .then(r => r.json())
      .then(d => setInfo({
        status: d.status ?? "none",
        plan: d.plan ?? null,
        periodEnd: d.periodEnd ?? null,
        isPro: d.status === "active" || d.status === "trialing",
      }))
      .catch(() => setInfo({ ...DEFAULT, status: "none" }));
  }, [user]);

  return info;
}
