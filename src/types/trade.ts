export type AssetClass = "STOCK" | "FUTURES" | "CRYPTO" | "FOREX" | "OPTIONS" | "CFD" | "ETF";
export type TradeSide = "LONG" | "SHORT";
export type TradeStatus = "OPEN" | "CLOSED";

export interface Trade {
  id: string;
  createdAt: string;
  updatedAt: string;
  ticker: string;
  assetClass: AssetClass;
  side: TradeSide;
  status: TradeStatus;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  entryTime: string;
  exitTime: string | null;
  fees: number;
  commissions: number;
  grossPnl: number | null;
  netPnl: number | null;
  manualPnl?: number | null;
  contractSize?: number | null;
  rMultiple: number | null;
  riskReward: number | null;
  holdTimeSeconds: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskAmount: number | null;
  expectedEntry?: number | null;   // for slippage tracking
  strategy: string | null;
  setup: string | null;
  timeframe: string | null;
  notes: string | null;
  tags: string[];
  emotions: string[];
  rating: number | null;
  favorite: boolean;
  reviewLater: boolean;
  screenshots: string[];
  customFields: Record<string, unknown>;
}

export interface TradeMetrics {
  totalTrades: number;
  totalNetPnl: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  sharpeRatio: number;
  expectancy: number;
  maxDrawdown: number;
  largestWin: number;
  largestLoss: number;
  avgHoldTime: number;
  avgRMultiple: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  currentStreak: number;        // + = win streak, - = loss streak (live)
  winCount: number;
  lossCount: number;
  totalFees: number;
  avgSlippage: number;          // avg abs slippage in price units
}

export interface EquityPoint {
  date: string;
  equity: number;
  pnl: number;
  drawdown: number;
  drawdownPct: number;
}

export interface DailyGoal {
  dailyProfitTarget: number;
  dailyMaxLoss: number;
  weeklyProfitTarget: number;
}

export interface PlaybookEntry {
  id: string;
  name: string;
  description: string;
  rules: string[];
  entryTriggers: string;
  exitRules: string;
  timeframes: string;
  screenshotUrl: string;
  tags: string[];
  createdAt: string;
}
