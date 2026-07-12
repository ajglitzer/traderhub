"use client";
import { useEffect, useRef } from "react";
import { useAccountStore } from "@/store/accounts";
import { useStore } from "@/store";

export function TradeAlerts() {
  const { goals: rawGoals } = useStore();
  const goals = {
    ...(rawGoals ?? {}),
    dailyProfitTarget: rawGoals?.dailyProfitTarget ?? 500,
    dailyMaxLoss:      rawGoals?.dailyMaxLoss      ?? 250,
    weeklyProfitTarget:rawGoals?.weeklyProfitTarget?? 2000,
  };
  const { getActiveTrades } = useAccountStore();
  const trades = getActiveTrades();
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayTrades = trades.filter(t => t.status === "CLOSED" && t.entryTime?.slice(0, 10) === today);
    const dayPnl = todayTrades.reduce((a, t) => a + (t.netPnl || 0), 0);

    const fire = (key: string, title: string, body: string, icon = "📊") => {
      if (firedRef.current.has(key)) return;
      firedRef.current.add(key);
      if (Notification.permission === "granted") {
        new Notification(`${icon} TraderHub — ${title}`, { body, silent: false });
      }
    };

    // Daily goal hit
    if (goals.dailyProfitTarget > 0 && dayPnl >= goals.dailyProfitTarget) {
      fire(`goal-${today}`, "Daily Goal Reached! 🎯",
        `You hit your $${goals.dailyProfitTarget} target. Net P&L today: +$${dayPnl.toFixed(2)}. Consider stopping for the day.`, "🎯");
    }

    // 75% of max loss
    if (goals.dailyMaxLoss > 0 && dayPnl <= -goals.dailyMaxLoss * 0.75 && dayPnl > -goals.dailyMaxLoss) {
      fire(`warn-${today}`, "Approaching Max Loss ⚠️",
        `You're at ${(Math.abs(dayPnl)/goals.dailyMaxLoss*100).toFixed(0)}% of your daily max loss ($${goals.dailyMaxLoss}). Current: $${dayPnl.toFixed(2)}.`, "⚠️");
    }

    // Max loss hit
    if (goals.dailyMaxLoss > 0 && dayPnl <= -goals.dailyMaxLoss) {
      fire(`maxloss-${today}`, "STOP TRADING — Max Loss Hit 🛑",
        `Daily max loss of $${goals.dailyMaxLoss} reached. Net: $${dayPnl.toFixed(2)}. Close your platform now.`, "🛑");
    }

    // 3-loss streak warning
    const recent = [...todayTrades].sort((a,b) => new Date(b.entryTime).getTime()-new Date(a.entryTime).getTime()).slice(0,3);
    if (recent.length >= 3 && recent.every(t => (t.netPnl||0) < 0)) {
      fire(`streak-${today}`, "3-Loss Streak ⚠️",
        "You have 3 consecutive losses today. Take a break before your next trade.", "⚠️");
    }
  }, [trades, goals]);

  return null; // invisible component
}
