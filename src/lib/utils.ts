import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt$(v: number, decimals = 2): string {
  const abs = Math.abs(v);
  const s = abs >= 1_000_000
    ? `$${(abs / 1_000_000).toFixed(1)}M`
    : abs >= 1_000
    ? `$${(abs / 1_000).toFixed(1)}K`
    : `$${abs.toFixed(decimals)}`;
  return v < 0 ? `-${s}` : s;
}

export function fmtFull$(v: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

export function fmtPct(v: number, d = 2): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
}

export function fmtN(v: number, d = 2): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
}

export function pnlClass(v: number): string {
  return v > 0 ? "pnl-pos" : v < 0 ? "pnl-neg" : "pnl-neu";
}

export function fmtHold(s: number | null): string {
  if (!s) return "–";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}
