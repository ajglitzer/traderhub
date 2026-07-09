import Papa from "papaparse";
import { Trade } from "@/types/trade";
import { calculateTradePnl } from "./calculations";

export type BrokerFormat = "TRADINGVIEW" | "TRADINGVIEW_BALANCE" | "GENERIC";

// -- Helpers -------------------------------------------------------------------
function pDate(v: string): string {
  if (!v?.trim()) return new Date().toISOString();
  const d = new Date(v.trim());
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function pFloat(v: string): number {
  if (!v?.trim()) return 0;
  const n = parseFloat(v.replace(/[$,\s%"]/g, ""));
  return isNaN(n) ? 0 : n;
}

function clean(s: string): string {
  return (s || "").toString().trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getCol(row: Record<string, string>, ...keys: string[]): string {
  const cols = Object.keys(row);
  for (const k of keys) {
    const kc = clean(k);
    const found = cols.find(c => clean(c) === kc) ?? cols.find(c => clean(c).includes(kc));
    if (found && row[found]?.trim()) return row[found].trim();
  }
  return "";
}

// -- Symbol helpers ------------------------------------------------------------
// TradingView paper trading uses full exchange-prefixed symbols: CME_MINI:NQ1!
// Strip to get root: CME_MINI:NQ1! -> NQ, COMEX_MINI:MGC1! -> MGC
function getRootSymbol(sym: string): string {
  // Remove exchange prefix (everything before and including ":")
  const withoutExchange = sym.includes(":") ? sym.split(":")[1] : sym;
  // Remove continuous contract suffix: NQ1! -> NQ, MGC1! -> MGC
  return withoutExchange
    .replace(/\d+!$/, "")   // "1!" suffix
    .replace(/!$/, "")       // bare "!"
    .replace(/[A-Z]\d{2,4}$/, "") // expiry like Z24, H25
    .toUpperCase();
}

const FUTURES_ROOTS = new Set([
  "ES","MES","NQ","MNQ","YM","MYM","RTY","M2K",
  "CL","MCL","QM","GC","MGC","SI","MSI","NG","HO","RB",
  "ZN","ZB","ZF","ZT","UB",
  "6E","6J","6B","6A","6C","6S","6M","6N",
  "HE","LE","GF","KC","CC","CT","SB","OJ",
  "ZC","ZW","ZS","ZM","ZL",
]);

function detectAssetClass(sym: string): Trade["assetClass"] {
  const root = getRootSymbol(sym);
  if (FUTURES_ROOTS.has(root)) return "FUTURES";
  const stripped = sym.replace(/[/_:-]/g, "").toUpperCase().replace(/\d+!?$/, "");
  const CURRENCIES = ["EUR","GBP","USD","JPY","AUD","CAD","CHF","NZD","XAU","XAG"];
  if (/^[A-Z]{6}$/.test(stripped) && CURRENCIES.includes(stripped.slice(0,3)) && CURRENCIES.includes(stripped.slice(3))) return "FOREX";
  if (stripped.includes("BTC") || stripped.includes("ETH") || stripped.includes("SOL") || stripped.includes("USDT")) return "CRYPTO";
  return "STOCK";
}

// Clean symbol for display: CME_MINI:NQ1! -> NQ1!
function displaySymbol(sym: string): string {
  return sym.includes(":") ? sym.split(":")[1] : sym;
}

// -- TradingView parser --------------------------------------------------------
// Columns: Symbol, Side, Type, Quantity, Limit price, Stop price, Fill price,
//          Status, Commission, Placing time, Closing time, Order ID, ...
function parseTradingView(rows: Record<string, string>[], debug: string[]): Partial<Trade>[] {
  debug.push(`Columns detected: ${Object.keys(rows[0]).join(" | ")}`);

  // Filter to filled orders only - use Placing time (execution order)
  const filled = rows
    .map(r => ({
      sym:    getCol(r, "Symbol", "symbol"),
      side:   getCol(r, "Side", "side").toLowerCase(),
      qty:    pFloat(getCol(r, "Quantity", "qty", "Qty")),
      fp:     pFloat(getCol(r, "Fill price", "fillprice", "Fill Price", "Avg price", "avg price")),
      time:   pDate(getCol(r, "Placing time", "placingtime", "Placing Time", "Closing time", "closingtime", "Closing Time", "Time", "time", "Date", "date") || new Date().toISOString()),
      comm:   pFloat(getCol(r, "Commission", "commission")),
      status: getCol(r, "Status", "status").toLowerCase(),
    }))
    .filter(o => o.status === "filled" && o.qty > 0 && o.fp > 0 && o.sym);

  debug.push(`${filled.length} filled orders out of ${rows.length} total`);
  if (!filled.length) return [];

  // Group by root symbol
  const byRoot: Record<string, typeof filled> = {};
  for (const o of filled) {
    const root = getRootSymbol(o.sym);
    if (!byRoot[root]) byRoot[root] = [];
    byRoot[root].push(o);
  }

  const trades: Partial<Trade>[] = [];

  for (const [root, ords] of Object.entries(byRoot)) {
    const rawSym = ords[0].sym;
    const sym = displaySymbol(rawSym);      // e.g. "NQ1!"
    const assetClass = detectAssetClass(rawSym);

    // Sort by time ascending
    const sorted = [...ords].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    debug.push(`${root} (${assetClass}): ${sorted.length} fills, sym=${sym}`);

    // FIFO position matching
    let pos: { qty: number; avgPrice: number; entryTime: string; side: "LONG" | "SHORT" } | null = null;

    for (const o of sorted) {
      const isBuy  = o.side === "buy";
      const isSell = o.side === "sell";

      if (!pos) {
        pos = { qty: o.qty, avgPrice: o.fp, entryTime: o.time, side: isBuy ? "LONG" : "SHORT" };
      } else {
        const closes = (pos.side === "LONG" && isSell) || (pos.side === "SHORT" && isBuy);
        if (closes) {
          const closeQty: number = Math.min(pos.qty, o.qty);
          const partial: Partial<Trade> = {
            ticker: sym,
            assetClass,
            side: pos.side,
            status: "CLOSED",
            entryPrice: pos.avgPrice,
            exitPrice: o.fp,
            quantity: closeQty,
            entryTime: pos.entryTime,
            exitTime: o.time,
            holdTimeSeconds: Math.round((new Date(o.time).getTime() - new Date(pos.entryTime).getTime()) / 1000),
            commissions: o.comm,
            fees: 0,
          };
          const { grossPnl, netPnl, rMultiple } = calculateTradePnl(partial);
          trades.push({ ...partial, grossPnl, netPnl, rMultiple });

          const leftPos: number = pos.qty - closeQty;
          pos = leftPos > 0.0001
            ? { qty: leftPos, avgPrice: pos.avgPrice, entryTime: pos.entryTime, side: pos.side }
            : null;

          const leftOrd: number = o.qty - closeQty;
          if (leftOrd > 0.0001 && !pos) {
            pos = { qty: leftOrd, avgPrice: o.fp, entryTime: o.time, side: isBuy ? "LONG" : "SHORT" };
          }
        } else {
          // Same direction - pyramid: weighted avg entry
          const total: number = pos.qty + o.qty;
          pos = { qty: total, avgPrice: (pos.avgPrice * pos.qty + o.fp * o.qty) / total, entryTime: pos.entryTime, side: pos.side };
        }
      }
    }

    // Leftover open position
    if (pos) {
      trades.push({
        ticker: sym, assetClass, side: pos.side, status: "OPEN",
        entryPrice: pos.avgPrice, quantity: pos.qty, entryTime: pos.entryTime,
        commissions: 0, fees: 0,
      });
    }
  }

  return trades;
}

// -- TradingView Balance History parser (most accurate - uses exact realized PnL) -
function parseTradingViewBalance(rows: Record<string, string>[], debug: string[]): Partial<Trade>[] {
  const trades: Partial<Trade>[] = [];
  const actionPat = /Close (short|long) position for symbol ([\w:!]+) at price ([\d.]+) for ([\d.]+) units\. Position AVG Price was ([\d.]+)(?:.*?point value: ([\d.]+))?/i;

  for (const row of rows) {
    const action = getCol(row, "Action", "action");
    const pnlStr = getCol(row, "Realized PnL (value)", "Realized PnL", "realizedpnlvalue", "realizedpnl");
    const time   = getCol(row, "Time", "time");
    if (!action) continue;

    const m = actionPat.exec(action);
    if (!m) { debug.push(`No match: ${action.slice(0, 50)}`); continue; }

    const [, closedSide, rawSym, exitPriceS, qtyS, avgPriceS, ptValS] = m;
    // "Close short" means the original position was SHORT
    const side: "LONG" | "SHORT" = closedSide.toLowerCase() === "short" ? "SHORT" : "LONG";
    const exitPrice = parseFloat(exitPriceS);
    const entryPrice = parseFloat(avgPriceS);
    const quantity = parseFloat(qtyS);
    const realizedPnl = parseFloat(pnlStr) || 0;

    const rawSymClean = rawSym; // e.g. CME_MINI:NQ1!
    const sym = displaySymbol(rawSymClean);
    const assetClass = detectAssetClass(rawSymClean);

    trades.push({
      ticker: sym,
      assetClass,
      side,
      status: "CLOSED",
      entryPrice,
      exitPrice,
      quantity,
      entryTime: pDate(time),
      exitTime: pDate(time),
      manualPnl: realizedPnl,   // use TradingView's exact realized PnL
      grossPnl: realizedPnl,
      netPnl: realizedPnl,
      fees: 0,
      commissions: 0,
    });
  }

  debug.push(`Balance parser: ${trades.length} closed trades`);
  return trades;
}


// -- Merge balance-history (accurate PnL) with order-history (entry times) -------
export function mergeBalanceAndOrders(
  balanceTrades: Partial<Trade>[],
  orderFills: { sym: string; side: string; qty: number; fp: number; time: string }[]
): Partial<Trade>[] {
  const priceTimes = new Map<number, string[]>();
  for (const o of orderFills) {
    const key = Math.round(o.fp * 100) / 100;
    if (!priceTimes.has(key)) priceTimes.set(key, []);
    priceTimes.get(key)!.push(o.time);
  }
  for (const arr of priceTimes.values()) arr.sort();

  return balanceTrades.map(t => {
    const entryKey = Math.round((t.entryPrice || 0) * 100) / 100;
    const times = priceTimes.get(entryKey);
    let entryTime = t.entryTime;
    if (times && times.length) {
      const exitMs = t.exitTime ? new Date(t.exitTime).getTime() : Infinity;
      const candidate = times.find(ts => new Date(ts).getTime() <= exitMs) || times[0];
      entryTime = new Date(candidate).toISOString();
    }
    const hold = entryTime && t.exitTime
      ? Math.round((new Date(t.exitTime).getTime() - new Date(entryTime).getTime()) / 1000)
      : null;
    return correctSideFromPnl({ ...t, entryTime, holdTimeSeconds: hold && hold > 0 ? hold : null });
  });
}

export function extractOrderFills(text: string): { sym: string; side: string; qty: number; fp: number; time: string; status: string }[] {
  const cleaned = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (Papa as any).parse(cleaned, { header: true, skipEmptyLines: true, transformHeader: (h: string) => h.trim() }) as { data: Record<string, string>[] };
  const rows = result.data || [];
  return rows
    .map(r => ({
      sym:  getCol(r, "Symbol", "symbol"),
      side: getCol(r, "Side", "side").toLowerCase(),
      qty:  pFloat(getCol(r, "Quantity", "qty", "Qty")),
      fp:   pFloat(getCol(r, "Fill price", "fillprice", "Fill Price")),
      time: pDate(getCol(r, "Placing time", "placingtime", "Placing Time", "Closing time", "closingtime") || ""),
      status: getCol(r, "Status", "status").toLowerCase(),
    }))
    .filter(o => o.status === "filled" && o.qty > 0 && o.fp > 0 && o.sym);
}

// -- Auto-correct trade side using PnL sign vs price direction -------------------
// If a trade has a known realized PnL and exit/entry prices, the side is
// determined: LONG profits when exit>entry, SHORT profits when exit<entry.
// This fixes mis-paired directions from order-history reconstruction.
export function correctSideFromPnl(t: Partial<Trade>): Partial<Trade> {
  const pnl = t.netPnl ?? t.grossPnl ?? t.manualPnl;
  if (pnl == null || pnl === 0) return t;
  if (t.entryPrice == null || t.exitPrice == null) return t;
  const priceDiff = t.exitPrice - t.entryPrice;
  if (Math.abs(priceDiff) < 1e-9) return t;
  // What side would the PnL sign imply-
  // profit & price up => LONG; profit & price down => SHORT
  // loss   & price up => SHORT; loss   & price down => LONG
  const impliedSide: "LONG" | "SHORT" =
    (pnl > 0) === (priceDiff > 0) ? "LONG" : "SHORT";
  if (t.side !== impliedSide) {
    return { ...t, side: impliedSide };
  }
  return t;
}

function parseGeneric(rows: Record<string, string>[]): Partial<Trade>[] {
  const trades: Partial<Trade>[] = [];
  for (const row of rows) {
    const ticker = getCol(row, "symbol","ticker","instrument","asset","Symbol","Ticker").toUpperCase();
    if (!ticker) continue;
    const sideRaw = clean(getCol(row, "side","direction","action","Side","Direction"));
    const side: Trade["side"] = (sideRaw.includes("short") || sideRaw === "sell") ? "SHORT" : "LONG";
    const entryPrice = pFloat(getCol(row, "entry","entry price","entryprice","open","avg price","price","Entry","Open"));
    const exitPriceRaw = getCol(row, "exit","exit price","exitprice","close","Close","Exit");
    const exitPrice = exitPriceRaw ? pFloat(exitPriceRaw) : null;
    const quantity = pFloat(getCol(row, "qty","quantity","size","contracts","shares","Qty","Quantity")) || 1;
    const entryTime = pDate(getCol(row, "entry time","time","date","datetime","Entry Time","Date","Time") || new Date().toISOString());
    const exitTimeRaw = getCol(row, "exit time","close time","Exit Time","Close Time");
    const exitTime = exitPrice && exitTimeRaw ? pDate(exitTimeRaw) : null;
    const csvPnl = getCol(row, "pnl","p&l","profit","pl","net pnl","realized","P&L","Profit");
    const manualPnl = csvPnl ? pFloat(csvPnl) : undefined;
    const assetClass = detectAssetClass(ticker);
    const partial: Partial<Trade> = {
      ticker, assetClass, side,
      status: (exitPrice && exitPrice > 0) ? "CLOSED" : "OPEN",
      entryPrice, exitPrice: exitPrice && exitPrice > 0 ? exitPrice : null,
      quantity, entryTime, exitTime,
      fees: pFloat(getCol(row, "fee","fees","Fee")),
      commissions: pFloat(getCol(row, "commission","comm","Commission")),
      strategy: getCol(row, "strategy","setup","Strategy") || null,
      notes: getCol(row, "notes","comment","Notes") || null,
    };
    if (partial.status === "CLOSED") {
      if (manualPnl !== undefined) {
        const { grossPnl, rMultiple } = calculateTradePnl(partial);
        trades.push({ ...partial, grossPnl, netPnl: manualPnl, rMultiple });
      } else {
        const { grossPnl, netPnl, rMultiple } = calculateTradePnl(partial);
        trades.push({ ...partial, grossPnl, netPnl, rMultiple });
      }
    } else {
      trades.push(partial);
    }
  }
  return trades;
}

// -- Format detection ----------------------------------------------------------
function detectFormat(headers: string[]): BrokerFormat {
  const h = headers.map(clean);
  // TradingView balance history - explicit realized PnL + Action description
  if (h.some(x => x.includes("realizedpnl")) && h.includes("action")) return "TRADINGVIEW_BALANCE";
  // TradingView paper trading has these exact columns
  if (h.includes("fillprice") || (h.includes("closingtime") && h.includes("orderid"))) return "TRADINGVIEW";
  if (h.includes("side") && h.includes("quantity") && h.includes("status")) return "TRADINGVIEW";
  return "GENERIC";
}

// -- Main export ---------------------------------------------------------------
export function parseCSV(text: string): {
  trades: Partial<Trade>[];
  format: BrokerFormat;
  errors: string[];
  rawRowCount: number;
  debug: string[];
} {
  const errors: string[] = [];
  const debug: string[] = [];
  const cleaned = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (Papa as any).parse(cleaned, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h: string) => h.trim(),
  }) as { data: Record<string, string>[]; errors: { message: string }[] };

  if (result.errors?.length) {
    errors.push(...result.errors.slice(0, 3).map((e: { message: string }) => e.message));
  }

  const rows = result.data;
  if (!rows.length) return { trades: [], format: "GENERIC", errors: ["No data rows found"], rawRowCount: 0, debug };

  const headers = Object.keys(rows[0]);
  debug.push(`Headers: ${headers.join(" | ")}`);
  const format = detectFormat(headers);
  debug.push(`Format: ${format}`);

  let trades: Partial<Trade>[] = [];
  try {
    if (format === "TRADINGVIEW_BALANCE") {
      trades = parseTradingViewBalance(rows, debug);
      if (!trades.length) { debug.push("Balance parser returned 0, trying generic"); trades = parseGeneric(rows); }
    } else if (format === "TRADINGVIEW") {
      trades = parseTradingView(rows, debug);
      if (!trades.length) {
        debug.push("TV parser returned 0, trying generic");
        trades = parseGeneric(rows);
      }
    } else {
      trades = parseGeneric(rows);
    }
  } catch (e) {
    errors.push(`Parse error: ${String(e)}`);
    debug.push(`Exception: ${String(e)}`);
    try { trades = parseGeneric(rows); } catch {}
  }

  // Auto-correct any mis-paired trade directions using PnL vs price direction
  const corrected = trades.map(correctSideFromPnl);
  const fixedCount = corrected.filter((t, i) => t.side !== trades[i].side).length;
  if (fixedCount > 0) debug.push(`Corrected ${fixedCount} trade directions from PnL`);

  debug.push(`Final: ${corrected.length} trades`);
  return { trades: corrected, format, errors, rawRowCount: rows.length, debug };
}
