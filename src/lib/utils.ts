import type { AssetClass } from "@/types/trade";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt$(v: number, decimals = 2): string {
  const abs = Math.abs(v);
  // Don't show .00 for clean whole numbers
  const isWhole = Number.isInteger(abs);
  const s = abs >= 1_000_000
    ? `$${(abs / 1_000_000).toFixed(1)}M`
    : abs >= 1_000
    ? `$${(abs / 1_000).toFixed(1)}K`
    : `$${isWhole && decimals === 2 ? abs.toFixed(0) : abs.toFixed(decimals)}`;
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

// ── Trade sorting ─────────────────────────────────────────────────────────────
// Column type maps. Sorting must compare numbers as numbers, dates as
// timestamps and text as text — comparing mixed types with < / > silently
// produces wrong ordering (e.g. "1000" < "9" is true for strings).
const NUMERIC_SORT_COLS = new Set([
  "entryPrice","exitPrice","quantity","netPnl","grossPnl","manualPnl",
  "rMultiple","riskReward","holdTimeSeconds","fees","commissions",
  "stopLoss","takeProfit","riskAmount","contractSize","expectedEntry",
]);
const DATE_SORT_COLS = new Set(["entryTime","exitTime","createdAt","updatedAt"]);

// Hoisted collator — constructing one per comparison is ~40x slower and
// makes sorting a large trade log by ticker visibly freeze the UI.
const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function toTime(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const t = new Date(v as string).getTime();
  return Number.isFinite(t) ? t : null;
}
function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * Type-safe comparator for a single trade column.
 * Contract: returns 0 for equal values and cmp(a,b) === -cmp(b,a).
 * Missing values (null/undefined/empty, e.g. an OPEN trade's netPnl) always
 * sort to the END regardless of direction, so they never masquerade as 0.
 */
export function compareTrades(
  a: any, b: any, sortBy: string, sortDir: string
): number {
  const dir = sortDir === "asc" ? 1 : -1;

  let av: number | string | null;
  let bv: number | string | null;
  if (DATE_SORT_COLS.has(sortBy))        { av = toTime(a?.[sortBy]); bv = toTime(b?.[sortBy]); }
  else if (NUMERIC_SORT_COLS.has(sortBy)){ av = toNum(a?.[sortBy]);  bv = toNum(b?.[sortBy]);  }
  else                                   { av = toStr(a?.[sortBy]);  bv = toStr(b?.[sortBy]);  }

  // Missing always last (direction-independent)
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;

  let r: number;
  if (typeof av === "string" && typeof bv === "string") {
    // numeric:true so "NQ2" sorts before "NQ10" correctly
    r = COLLATOR.compare(av, bv);
  } else {
    r = av < bv ? -1 : av > bv ? 1 : 0;
  }
  return r * dir;
}

export function getFilteredTrades(
  trades: any[],
  filters: Record<string,string>,
  page: number,
  limit = 50
): { trades: any[]; total: number; totalPages: number } {
  if (!Array.isArray(trades)) return { trades: [], total: 0, totalPages: 1 };
  let list = trades.filter(Boolean);

  const f = filters ?? {};
  const { status, side, ticker, sortBy, sortDir, dateFrom, dateTo, tag } = f;
  // The Trade model field is `assetClass`; `assetType` accepted for old saved filters.
  const assetClass = f.assetClass || f.assetType;

  if (status)     list = list.filter(t => t.status === status);
  if (side)       list = list.filter(t => t.side === side);
  if (assetClass) list = list.filter(t => t.assetClass === assetClass);
  if (ticker)     list = list.filter(t => String(t.ticker ?? "").toLowerCase().includes(ticker.toLowerCase()));
  if (tag)        list = list.filter(t => Array.isArray(t.tags) && t.tags.includes(tag));

  // Date filters via timestamps — string compare breaks on mixed formats
  if (dateFrom) {
    const from = new Date(dateFrom + "T00:00:00").getTime();
    if (Number.isFinite(from)) list = list.filter(t => { const x = toTime(t.entryTime); return x !== null && x >= from; });
  }
  if (dateTo) {
    const to = new Date(dateTo + "T23:59:59.999").getTime();
    if (Number.isFinite(to)) list = list.filter(t => { const x = toTime(t.entryTime); return x !== null && x <= to; });
  }

  // Stable sort: decorate with original index and use it as the final tiebreak
  // so equal rows never shuffle between renders.
  const col = sortBy || "entryTime";
  const dir = sortDir === "asc" ? "asc" : "desc";
  list = list
    .map((t, i) => ({ t, i }))
    .sort((x, y) => compareTrades(x.t, y.t, col, dir) || (x.i - y.i))
    .map(d => d.t);

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page || 1), totalPages);
  return { trades: list.slice((safePage - 1) * limit, safePage * limit), total, totalPages };
}

// ── Asset class detection ─────────────────────────────────────────────────────
// Single source of truth, shared by the CSV parsers and the P&L engine.
// Misclassifying a futures contract as STOCK silently computes P&L with
// multiplier 1 (e.g. gold 10x/100x too small), so this must stay correct.

export const FUTURES_ROOTS = new Set([
  // Equity index
  "ES","MES","NQ","MNQ","YM","MYM","RTY","M2K","NKD","EMD",
  // Energy
  "CL","MCL","QM","NG","QG","HO","RB","BZ",
  // Metals
  "GC","MGC","SI","SIL","MSI","HG","MHG","PL","PA",
  // Treasury / rates
  "ZN","ZB","ZF","ZT","UB","TN","GE","SR3","ZQ",
  // Currency futures
  "6E","6J","6B","6A","6C","6S","6M","6N","M6E","M6A","M6B",
  // Agriculture
  "HE","LE","GF","KC","CC","CT","SB","OJ",
  "ZC","ZW","ZS","ZM","ZL","ZO","ZR",
  // Crypto futures
  "BTC","MBT","ETH","MET",
]);

const FX_CURRENCIES = ["EUR","GBP","USD","JPY","AUD","CAD","CHF","NZD","XAU","XAG"];

/** CME_MINI:NQ1! -> NQ,  COMEX_MINI:MGC1! -> MGC,  GCZ24 -> GC */
export function getRootSymbol(sym: string): string {
  const s = String(sym ?? "");
  const withoutExchange = s.includes(":") ? s.split(":")[1] : s;
  return withoutExchange
    .replace(/\d+!$/, "")          // "1!" continuous-contract suffix
    .replace(/!$/, "")             // bare "!"
    .replace(/[A-Z]\d{2,4}$/i, "") // expiry code like Z24 / H2025
    .trim()
    .toUpperCase();
}

/**
 * Normalized root for FUTURES_SPECS lookup.
 * Must NOT strip digits — roots like "6E", "M2K" and "SR3" are numeric by design.
 */
export function specRootSymbol(sym: string): string {
  return getRootSymbol(sym).replace(/[^A-Z0-9]/g, "");
}

export function detectAssetClass(sym: string): AssetClass {
  const raw = String(sym ?? "");
  if (!raw) return "STOCK";

  if (FUTURES_ROOTS.has(getRootSymbol(raw))) return "FUTURES";

  const stripped = raw.replace(/[/_:-]/g, "").toUpperCase().replace(/\d+!?$/, "");

  if (/^[A-Z]{6}$/.test(stripped) &&
      FX_CURRENCIES.includes(stripped.slice(0, 3)) &&
      FX_CURRENCIES.includes(stripped.slice(3))) return "FOREX";

  if (["BTC","ETH","SOL","USDT","XRP","DOGE","ADA"].some(x => stripped.includes(x))) return "CRYPTO";

  return "STOCK";
}

/**
 * Trust an explicit assetClass only when the ticker doesn't clearly contradict it.
 * Repairs legacy/imported trades saved with a missing or wrong class.
 */
export function resolveAssetClass(trade: { assetClass?: string; ticker?: string }): AssetClass {
  const detected = detectAssetClass(trade?.ticker ?? "");
  const stated = trade?.assetClass;
  if (!stated) return detected;
  // A ticker that is unambiguously a futures root wins over a stale "STOCK".
  if (detected === "FUTURES" && stated !== "FUTURES") return "FUTURES";
  return stated as AssetClass;
}
