import { Trade, TradeMetrics, EquityPoint } from "@/types/trade";

// Contract specs for common futures
const FUTURES_SPECS: Record<string, { multiplier: number; currency: string }> = {
  // Equity index
  "ES":   { multiplier: 50,    currency: "USD" },  // E-mini S&P 500
  "MES":  { multiplier: 5,     currency: "USD" },  // Micro E-mini S&P 500
  "NQ":   { multiplier: 20,    currency: "USD" },  // E-mini Nasdaq
  "MNQ":  { multiplier: 2,     currency: "USD" },  // Micro E-mini Nasdaq
  "YM":   { multiplier: 5,     currency: "USD" },  // E-mini Dow
  "MYM":  { multiplier: 0.5,   currency: "USD" },  // Micro E-mini Dow
  "RTY":  { multiplier: 50,    currency: "USD" },  // E-mini Russell 2000
  "M2K":  { multiplier: 5,     currency: "USD" },  // Micro E-mini Russell
  // Commodities
  "CL":   { multiplier: 1000,  currency: "USD" },  // Crude Oil
  "MCL":  { multiplier: 100,   currency: "USD" },  // Micro Crude Oil
  "GC":   { multiplier: 100,   currency: "USD" },  // Gold
  "MGC":  { multiplier: 10,    currency: "USD" },  // Micro Gold
  "SI":   { multiplier: 5000,  currency: "USD" },  // Silver
  "NG":   { multiplier: 10000, currency: "USD" },  // Natural Gas
  // Treasury
  "ZN":   { multiplier: 1000,  currency: "USD" },  // 10-Year T-Note
  "ZB":   { multiplier: 1000,  currency: "USD" },  // 30-Year T-Bond
  "ZF":   { multiplier: 1000,  currency: "USD" },  // 5-Year T-Note
  // Forex futures
  "6E":   { multiplier: 125000, currency: "USD" }, // Euro FX
  "6J":   { multiplier: 12500000, currency: "USD" }, // Japanese Yen
  "6B":   { multiplier: 62500, currency: "USD" },  // British Pound
  "6A":   { multiplier: 100000, currency: "USD" }, // Australian Dollar
  "6C":   { multiplier: 100000, currency: "USD" }, // Canadian Dollar
};

// Standard forex lot sizes (in units of base currency)
const FOREX_LOT = 100000;  // 1 standard lot

export function calculateTradePnl(trade: Partial<Trade>): {
  grossPnl: number;
  netPnl: number;
  rMultiple: number | null;
} {
  // If manual P&L is set, always use it
  if (trade.manualPnl !== undefined && trade.manualPnl !== null && trade.manualPnl !== 0) {
    const costs = (trade.fees || 0) + (trade.commissions || 0);
    const netPnl = trade.manualPnl - costs;
    let rMultiple: number | null = null;
    if (trade.stopLoss && trade.entryPrice && trade.quantity) {
      const risk = Math.abs(trade.entryPrice - trade.stopLoss) * trade.quantity;
      if (risk > 0) rMultiple = netPnl / risk;
    } else if (trade.riskAmount && trade.riskAmount > 0) {
      rMultiple = netPnl / trade.riskAmount;
    }
    return { grossPnl: trade.manualPnl, netPnl, rMultiple };
  }

  if (!trade.exitPrice || !trade.entryPrice || !trade.quantity) {
    return { grossPnl: 0, netPnl: 0, rMultiple: null };
  }

  const sign = trade.side === "SHORT" ? -1 : 1;
  const priceDiff = trade.exitPrice - trade.entryPrice;
  const assetClass = trade.assetClass || "STOCK";
  // Strip continuous contract suffix: NQ1! -> NQ, MGC1! -> MGC
  const ticker = (trade.ticker || "").toUpperCase()
    .replace(/\d+!$/, "")   // "1!" suffix
    .replace(/!$/, "")        // bare "!"
    .replace(/[^A-Z]/g, "");  // remove remaining non-alpha

  let grossPnl = 0;

  if (assetClass === "FUTURES") {
    // Look up contract multiplier
    const spec = FUTURES_SPECS[ticker] || FUTURES_SPECS[ticker.replace(/\d+/g, "")] || { multiplier: 1 };
    grossPnl = sign * priceDiff * trade.quantity * spec.multiplier;
  } else if (assetClass === "FOREX") {
    // Standard lot = 100,000 units of base currency
    // For forex pairs, P&L is in quote currency
    // Use contractSize if specified, otherwise default to standard lot * qty
    const lotSize = trade.contractSize || FOREX_LOT;
    grossPnl = sign * priceDiff * trade.quantity * lotSize;
  } else if (assetClass === "OPTIONS") {
    // Options: 1 contract = 100 shares
    grossPnl = sign * priceDiff * trade.quantity * 100;
  } else if (assetClass === "CFD") {
    // CFD: direct price diff * qty (like stocks but can be fractional)
    grossPnl = sign * priceDiff * trade.quantity;
  } else {
    // STOCK, CRYPTO, ETF: direct
    grossPnl = sign * priceDiff * trade.quantity;
  }

  const costs = (trade.fees || 0) + (trade.commissions || 0);
  const netPnl = grossPnl - costs;

  let rMultiple: number | null = null;
  if (trade.stopLoss && trade.entryPrice) {
    const riskPerUnit = Math.abs(trade.entryPrice - trade.stopLoss);
    const totalRisk = assetClass === "FUTURES"
      ? riskPerUnit * trade.quantity * (FUTURES_SPECS[ticker]?.multiplier || 1)
      : assetClass === "FOREX"
      ? riskPerUnit * trade.quantity * (trade.contractSize || FOREX_LOT)
      : assetClass === "OPTIONS"
      ? riskPerUnit * trade.quantity * 100
      : riskPerUnit * trade.quantity;
    if (totalRisk > 0) rMultiple = netPnl / totalRisk;
  } else if (trade.riskAmount && trade.riskAmount > 0) {
    rMultiple = netPnl / trade.riskAmount;
  }

  return { grossPnl, netPnl, rMultiple };
}

export function calculateMetrics(trades: Trade[]): TradeMetrics {
  // Guard: `trades` can be undefined mid-hydration — .filter() would throw
  // before we ever reach the safe-default return below.
  const cl = (Array.isArray(trades) ? trades : []).filter((t) => t && t.status === "CLOSED" && t.netPnl !== null);
  if (!cl.length) return {
    totalTrades:0,totalNetPnl:0,winRate:0,avgWin:0,avgLoss:0,
    profitFactor:0,sharpeRatio:0,expectancy:0,maxDrawdown:0,
    largestWin:0,largestLoss:0,avgHoldTime:0,avgRMultiple:0,
    consecutiveWins:0,consecutiveLosses:0,currentStreak:0,winCount:0,lossCount:0,totalFees:0,avgSlippage:0,
  };

  const pnls = cl.map((t) => t.netPnl!);
  const wins = cl.filter((t) => t.netPnl! > 0);
  const losses = cl.filter((t) => t.netPnl! < 0);
  const totalNetPnl = pnls.reduce((a, b) => a + b, 0);
  const wSum = wins.reduce((a, t) => a + t.netPnl!, 0);
  const lSum = Math.abs(losses.reduce((a, t) => a + t.netPnl!, 0));
  const avg = totalNetPnl / cl.length;
  const std = Math.sqrt(pnls.reduce((a, p) => a + Math.pow(p - avg, 2), 0) / cl.length);
  const downsideVar = pnls.filter(p=>p<0).reduce((a,p)=>a+Math.pow(p,2),0)/cl.length;

  let peak = 0, eq = 0, maxDD = 0;
  for (const p of pnls) { eq+=p; if(eq>peak)peak=eq; const dd=peak-eq; if(dd>maxDD)maxDD=dd; }

  let mxW=0,cW=0,mxL=0,cL=0;
  for (const p of pnls) { if(p>0){cW++;cL=0;mxW=Math.max(mxW,cW);}else{cL++;cW=0;mxL=Math.max(mxL,cL);} }

  const rVals = cl.filter((t)=>t.rMultiple!==null).map((t)=>t.rMultiple!);
  const hTimes = cl.filter((t)=>t.holdTimeSeconds).map((t)=>t.holdTimeSeconds!);

  // Current live streak (+wins, -losses)
  let curStreak = 0;
  for (let i = pnls.length - 1; i >= 0; i--) {
    if (i === pnls.length - 1) { curStreak = pnls[i] > 0 ? 1 : -1; continue; }
    if (pnls[i] > 0 && curStreak > 0) curStreak++;
    else if (pnls[i] < 0 && curStreak < 0) curStreak--;
    else break;
  }

  // Slippage: difference between expectedEntry and entryPrice
  const slippages = cl.filter(t => t.expectedEntry && t.expectedEntry > 0)
    .map(t => Math.abs(t.entryPrice - (t.expectedEntry || t.entryPrice)));

  return {
    totalTrades: cl.length,
    totalNetPnl,
    winRate: wins.length / cl.length,
    avgWin: wins.length ? wSum / wins.length : 0,
    avgLoss: losses.length ? -(lSum / losses.length) : 0,
    profitFactor: lSum > 0 ? wSum / lSum : wSum > 0 ? Infinity : 0,
    sharpeRatio: std > 0 ? (avg / std) * Math.sqrt(252) : 0,
    expectancy: avg,
    maxDrawdown: maxDD,
    largestWin: wins.length ? wins.reduce((m,t)=>Math.max(m,t.netPnl!), -Infinity) : 0,
    largestLoss: losses.length ? losses.reduce((m,t)=>Math.min(m,t.netPnl!), Infinity) : 0,
    avgHoldTime: hTimes.length ? hTimes.reduce((a,b)=>a+b,0)/hTimes.length : 0,
    avgRMultiple: rVals.length ? rVals.reduce((a,b)=>a+b,0)/rVals.length : 0,
    consecutiveWins: mxW,
    consecutiveLosses: mxL,
    currentStreak: curStreak,
    winCount: wins.length,
    lossCount: losses.length,
    totalFees: cl.reduce((a,t)=>a+(t.fees||0)+(t.commissions||0),0),
    avgSlippage: slippages.length ? slippages.reduce((a,b)=>a+b,0)/slippages.length : 0,
  };
}

export function buildEquityCurve(trades: Trade[]): EquityPoint[] {
  const sorted = [...(Array.isArray(trades) ? trades : [])]
    .filter((t) => t && t.status==="CLOSED" && t.netPnl!==null)
    .sort((a,b) => new Date(a.exitTime||a.entryTime).getTime()-new Date(b.exitTime||b.entryTime).getTime());
  let eq=0, peak=0;
  return sorted.map((t) => {
    eq += t.netPnl!;
    if(eq>peak)peak=eq;
    const dd=peak-eq;
    return { date:t.exitTime||t.entryTime, equity:eq, pnl:t.netPnl!, drawdown:dd, drawdownPct:peak>0?(dd/peak)*100:0 };
  });
}

export function runMonteCarlo(trades: Trade[], runs=400) {
  const pnls = trades.filter((t)=>t.netPnl!==null).map((t)=>t.netPnl!);
  if(!pnls.length) return { percentiles:{}, paths:[] };
  const n = pnls.length;
  const paths: number[][] = [];
  for(let s=0;s<runs;s++){
    let eq=0; const path=[0];
    for(let i=0;i<n;i++){ eq+=pnls[Math.floor(Math.random()*n)]; path.push(eq); }
    paths.push(path);
  }
  const finals = paths.map((p)=>p[p.length-1]).sort((a,b)=>a-b);
  const p = (pct:number) => finals[Math.floor((pct/100)*finals.length)] ?? 0;
  return { percentiles:{p5:p(5),p25:p(25),p50:p(50),p75:p(75),p95:p(95)}, paths:paths.slice(0,80) };
}
