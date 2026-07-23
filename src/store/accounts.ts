/**
 * Accounts store — NO Zustand persist middleware.
 *
 * persist() re-hydrates on every store-subscriber mount, which caused
 * stale data to flash back whenever the user switched app tabs.
 * Solution: plain create() with explicit localStorage save inside every
 * mutation. One source of truth, zero surprise re-hydrations.
 */
import { create } from "zustand";
import { Trade } from "@/types/trade";
import { resolveAssetClass } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────
export interface Account {
  id: string;
  name: string;
  startingBalance: number;
  color: string;
  broker: string;
  createdAt: string;
  updatedAt?: string;
}

interface AccountStore {
  accounts: Account[];
  activeAccountId: string;
  tradesByAccount: Record<string, Trade[]>;

  addAccount:       (a: Omit<Account, "id"|"createdAt">) => string;
  updateAccount:    (id: string, data: Partial<Account>) => void;
  deleteAccount:    (id: string) => void;
  setActiveAccount: (id: string) => void;

  getActiveTrades:    () => Trade[];
  setAccountTrades:   (accountId: string, trades: Trade[]) => void;
  addAccountTrades:   (accountId: string, newTrades: Trade[]) => void;
  deleteAccountTrade: (accountId: string, tradeId: string) => void;
  updateAccountTrade: (accountId: string, tradeId: string, data: Partial<Trade>) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────
export const DEFAULT_ACCOUNT: Account = {
  id: "default",
  name: "Main Account",
  startingBalance: 10000,
  color: "#00e5ff",
  broker: "TradingView Paper",
  createdAt: new Date().toISOString(),
};

export const COLORS = ["#00e5ff","#00e676","#d500f9","#ffab00","#ff6b35","#f9a8d4","#6ee7b7","#93c5fd"];

// Flag written to localStorage when user explicitly clears data.
// loadFromCloud checks this and skips restoring if set.
export const ACCT_CLEARED_KEY = "th_accts_cleared";

const FRESH_STATE = () => ({
  accounts: [{ ...DEFAULT_ACCOUNT }],
  activeAccountId: "default",
  tradesByAccount: { default: [] as Trade[] },
});

// ── Storage helpers ────────────────────────────────────────────────────────────
// ONE canonical key, versioned. Never changes between deploys.
// Obfuscated key — harder to find/edit in DevTools Application tab
export const ACCT_STORAGE_KEY = "th_accts";

// In-memory flag — set when user clears trades this session.
// Prevents loadFromCloud from writing trades back after a clear.
let _sessionCleared = false;
export function markSessionCleared() { _sessionCleared = true; }
export function clearSessionCleared() { _sessionCleared = false; }
export function isSessionCleared() { return _sessionCleared; }
// Set after clearing so auth-provider skips loadFromCloud on next load
export const CLEARED_FLAG = "th_accts_cleared";

function uid(): string {
  try { return (typeof window !== "undefined" && localStorage.getItem("th_current_user_id")) || ""; }
  catch { return ""; }
}

function storageKey(userId?: string): string {
  const u = userId ?? uid();
  return u ? `${ACCT_STORAGE_KEY}__${u}` : ACCT_STORAGE_KEY;
}

// Save the three mutable fields
function persist(
  state: Pick<AccountStore, "accounts"|"activeAccountId"|"tradesByAccount">,
  userId?: string
) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify({
      accounts:        state.accounts,
      activeAccountId: state.activeAccountId,
      tradesByAccount: state.tradesByAccount,
    }));
  } catch {}
}

// ── Public API (used by auth-provider) ────────────────────────────────────────
export function loadUserData(userId: string) {
  if (!userId) { useAccountStore.setState(FRESH_STATE()); return; }
  try {
    // Only read from the canonical key — no legacy fallbacks.
    // Fallbacks caused "clear trades" to restore ghost data from old keys.
    const canonicalKey = `${ACCT_STORAGE_KEY}__${userId}`;
    const raw = localStorage.getItem(canonicalKey);
    if (!raw) { useAccountStore.setState(FRESH_STATE()); return; }

    const parsed = JSON.parse(raw);
    const d = parsed?.state ?? parsed;

    // Repair legacy trades saved with a missing/incorrect assetClass.
    // A futures ticker stored as STOCK computes P&L with multiplier 1.
    const repaired: Record<string, any[]> = {};
    const byAcct = (d.tradesByAccount && typeof d.tradesByAccount === "object") ? d.tradesByAccount : {};
    for (const [acctId, list] of Object.entries(byAcct)) {
      repaired[acctId] = Array.isArray(list)
        ? (list as any[]).filter(Boolean).map(t => {
            const fixed = resolveAssetClass(t);
            return fixed === t.assetClass ? t : { ...t, assetClass: fixed };
          })
        : [];
    }

    const state = {
      accounts: Array.isArray(d.accounts) && d.accounts.length
        ? d.accounts : FRESH_STATE().accounts,
      activeAccountId: d.activeAccountId || "default",
      tradesByAccount: Object.keys(repaired).length ? repaired : { default: [] },
    };
    useAccountStore.setState(state);
  } catch { useAccountStore.setState(FRESH_STATE()); }
}

export function saveUserData(userId: string) {
  if (!userId) return;
  persist(useAccountStore.getState(), userId);
}

export function clearUserData() {
  useAccountStore.setState(FRESH_STATE());
}

// ── Cloud sync ────────────────────────────────────────────────────────────────
// Every trade is tagged with the account it belongs to when synced, since the
// cloud table has no concept of accounts on its own — that lets a second
// device reconstruct tradesByAccount correctly. Account metadata (name,
// balance, color...) rides along as a sentinel row (see api/sync/route.ts).
let cloudTimer: ReturnType<typeof setTimeout> | null = null;
function queueFullSync() {
  if (typeof window === "undefined") return;
  if (cloudTimer) clearTimeout(cloudTimer);
  cloudTimer = setTimeout(async () => {
    try {
      const { accounts, tradesByAccount } = useAccountStore.getState();
      const trades = Object.entries(tradesByAccount).flatMap(([accountId, list]) =>
        (list || []).map(t => ({ ...t, accountId }))
      );
      await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accounts, trades }),
      });
    } catch {}
  }, 2000);
}

export async function loadFromCloud(): Promise<{ trades: any[]; accounts: Account[] | null }> {
  try {
    const r = await fetch("/api/sync");
    const d = await r.json();
    return { trades: Array.isArray(d.trades) ? d.trades : [], accounts: Array.isArray(d.accounts) ? d.accounts : null };
  } catch { return { trades: [], accounts: null }; }
}

/** Pulls cloud state and merges it into the local store — the "download" half
 * of sync, run on sign-in so a second device sees trades/edits made elsewhere.
 * Per trade/account, whichever side has the newer updatedAt wins; anything
 * present on only one side is kept. Re-uploads the merged result afterward so
 * a device that missed earlier edits/deletes gets fully reconciled too. */
export async function mergeFromCloud(userId: string): Promise<void> {
  if (!userId || isSessionCleared()) return;
  try {
    if (localStorage.getItem(`${ACCT_CLEARED_KEY}__${userId}`)) return;
  } catch {}

  const { trades: cloudTrades, accounts: cloudAccounts } = await loadFromCloud();
  if (!cloudTrades.length && !cloudAccounts) return;
  if (isSessionCleared()) return; // user cleared data while this was in flight

  const newer = (a?: string, b?: string) => new Date(a || 0).getTime() >= new Date(b || 0).getTime();

  useAccountStore.setState(s => {
    // Merge accounts by id, newer updatedAt wins
    const accountsById = new Map(s.accounts.map(a => [a.id, a]));
    for (const cloudAcct of cloudAccounts || []) {
      const local = accountsById.get(cloudAcct.id);
      if (!local || newer(cloudAcct.updatedAt, local.updatedAt)) accountsById.set(cloudAcct.id, cloudAcct);
    }

    // Merge trades per account by trade id, newer updatedAt/createdAt wins.
    // tradesById: accountId -> (tradeId -> Trade), used only as a merge scratchpad.
    const tradesById = new Map<string, Map<string, Trade>>();
    for (const [accountId, list] of Object.entries(s.tradesByAccount)) {
      tradesById.set(accountId, new Map((list || []).map(t => [t.id, t])));
    }
    for (const raw of cloudTrades) {
      const { accountId, ...trade } = raw as Trade & { accountId?: string };
      const acctId = accountId || "default";
      if (!accountsById.has(acctId)) accountsById.set(acctId, { ...DEFAULT_ACCOUNT, id: acctId });
      if (!tradesById.has(acctId)) tradesById.set(acctId, new Map());
      const bucket = tradesById.get(acctId)!;
      const local = bucket.get(trade.id);
      if (!local || newer(trade.updatedAt || trade.createdAt, local.updatedAt || local.createdAt)) {
        bucket.set(trade.id, trade);
      }
    }

    const accounts = Array.from(accountsById.values());
    const tradesByAccount: Record<string, Trade[]> = {};
    for (const [acctId, bucket] of tradesById) tradesByAccount[acctId] = Array.from(bucket.values());

    const next = { ...s, accounts, tradesByAccount };
    persist(next, userId);
    return next;
  });

  queueFullSync(); // heal anything the cloud was missing (old edits/deletes, etc.)
}

export async function clearCloud(): Promise<void> {
  try {
    await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clearAll: true }),
    });
  } catch {}
}

export async function deleteFromCloud(id: string) {
  try {
    await fetch("/api/sync", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  } catch {}
}

async function deleteAccountFromCloud(accountId: string) {
  try {
    await fetch("/api/sync", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId }),
    });
  } catch {}
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useAccountStore = create<AccountStore>()((set, get) => ({
  ...FRESH_STATE(),

  addAccount: (a) => {
    const id = Date.now().toString();
    const account: Account = { ...a, id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    set(s => {
      const next = { ...s, accounts: [...s.accounts, account] };
      persist(next);
      queueFullSync();
      return next;
    });
    return id;
  },

  updateAccount: (id, data) =>
    set(s => {
      const next = { ...s, accounts: s.accounts.map(a => a.id === id ? { ...a, ...data, updatedAt: new Date().toISOString() } : a) };
      persist(next);
      queueFullSync();
      return next;
    }),

  deleteAccount: (id) => {
    const { accounts, activeAccountId, tradesByAccount } = get();
    if (accounts.length <= 1) return;
    const remaining = accounts.filter(a => a.id !== id);
    const newActive = activeAccountId === id ? remaining[0]?.id || "default" : activeAccountId;
    const { [id]: _, ...restTrades } = tradesByAccount;
    const next = { accounts: remaining, activeAccountId: newActive, tradesByAccount: restTrades };
    set(next);
    persist({ ...get(), ...next });
    deleteAccountFromCloud(id);
    queueFullSync();
  },

  setActiveAccount: (id) => {
    set({ activeAccountId: id });
    persist({ ...get(), activeAccountId: id });
  },

  getActiveTrades: () => {
    const { activeAccountId, tradesByAccount } = get();
    return (tradesByAccount ?? {})[activeAccountId] || [];
  },

  setAccountTrades: (accountId, trades) => {
    // Block cloud from restoring trades after user explicitly cleared this session
    if (_sessionCleared && trades.length > 0) {
      return;
    }
    set(s => {
      const next = { ...s, tradesByAccount: { ...s.tradesByAccount, [accountId]: trades } };
      persist(next);
      queueFullSync();
      return next;
    });
  },

  addAccountTrades: (accountId, newTrades) => {
    const existing = get().tradesByAccount[accountId] || [];
    const fp = (t: Partial<Trade>) =>
      `${t.ticker}|${t.entryTime}|${t.exitTime ?? ""}|${t.side}|${t.quantity}|${t.entryPrice}|${t.exitPrice ?? ""}`;
    const seen = new Set(existing.map(fp));
    const fresh: Trade[] = [];
    for (const t of newTrades) {
      const k = fp(t);
      if (seen.has(k)) continue;
      seen.add(k);
      fresh.push(t);
    }
    const merged = [...fresh, ...existing];
    set(s => {
      const next = { ...s, tradesByAccount: { ...s.tradesByAccount, [accountId]: merged } };
      persist(next);
      queueFullSync();
      // Clear the "user cleared data" flag so cloud sync resumes after import
      try {
        const u = localStorage.getItem("th_current_user_id") || "";
        if (u) localStorage.removeItem(`${ACCT_CLEARED_KEY}__${u}`);
      } catch {}
      return next;
    });
  },

  deleteAccountTrade: (accountId, tradeId) => {
    deleteFromCloud(tradeId);
    set(s => {
      const trades = (s.tradesByAccount[accountId] || []).filter(t => t.id !== tradeId);
      const next = { ...s, tradesByAccount: { ...s.tradesByAccount, [accountId]: trades } };
      persist(next);
      return next;
    });
  },

  updateAccountTrade: (accountId, tradeId, data) =>
    set(s => {
      const trades = (s.tradesByAccount[accountId] || [])
        .map(t => t.id === tradeId ? { ...t, ...data, updatedAt: new Date().toISOString() } : t);
      const next = { ...s, tradesByAccount: { ...s.tradesByAccount, [accountId]: trades } };
      persist(next);
      queueFullSync();
      return next;
    }),
}));

// Save on tab close so nothing is lost
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    const u = uid();
    if (u) saveUserData(u);
  });
}

export { COLORS as ACCOUNT_COLORS };
