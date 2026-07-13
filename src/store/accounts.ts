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

// ── Types ──────────────────────────────────────────────────────────────────────
export interface Account {
  id: string;
  name: string;
  startingBalance: number;
  color: string;
  broker: string;
  createdAt: string;
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

const FRESH_STATE = () => ({
  accounts: [{ ...DEFAULT_ACCOUNT }],
  activeAccountId: "default",
  tradesByAccount: { default: [] as Trade[] },
});

// ── Storage helpers ────────────────────────────────────────────────────────────
// ONE canonical key, versioned. Never changes between deploys.
// Obfuscated key — harder to find/edit in DevTools Application tab
export const ACCT_STORAGE_KEY = "th_accts";

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

    const state = {
      accounts: Array.isArray(d.accounts) && d.accounts.length
        ? d.accounts : FRESH_STATE().accounts,
      activeAccountId: d.activeAccountId || "default",
      tradesByAccount: (d.tradesByAccount && Object.keys(d.tradesByAccount).length)
        ? d.tradesByAccount : { default: [] },
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
let cloudTimer: ReturnType<typeof setTimeout> | null = null;
function queueSync(trades: Trade[]) {
  if (typeof window === "undefined") return;
  if (cloudTimer) clearTimeout(cloudTimer);
  cloudTimer = setTimeout(async () => {
    try {
      await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trades }),
      });
    } catch {}
  }, 2000);
}

export async function loadFromCloud(): Promise<any[]> {
  try {
    const r = await fetch("/api/sync");
    const d = await r.json();
    return Array.isArray(d.trades) ? d.trades : [];
  } catch { return []; }
}

export async function clearCloud(): Promise<void> {
  try {
    // POST empty array to replace all cloud trades with nothing
    await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trades: [], clearAll: true }),
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

// ── Store ─────────────────────────────────────────────────────────────────────
export const useAccountStore = create<AccountStore>()((set, get) => ({
  ...FRESH_STATE(),

  addAccount: (a) => {
    const id = Date.now().toString();
    const account: Account = { ...a, id, createdAt: new Date().toISOString() };
    set(s => {
      const next = { ...s, accounts: [...s.accounts, account] };
      persist(next);
      return next;
    });
    return id;
  },

  updateAccount: (id, data) =>
    set(s => {
      const next = { ...s, accounts: s.accounts.map(a => a.id === id ? { ...a, ...data } : a) };
      persist(next);
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
  },

  setActiveAccount: (id) => {
    set({ activeAccountId: id });
    persist({ ...get(), activeAccountId: id });
  },

  getActiveTrades: () => {
    const { activeAccountId, tradesByAccount } = get();
    return (tradesByAccount ?? {})[activeAccountId] || [];
  },

  setAccountTrades: (accountId, trades) =>
    set(s => {
      const next = { ...s, tradesByAccount: { ...s.tradesByAccount, [accountId]: trades } };
      persist(next);
      queueSync(trades);
      return next;
    }),

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
      queueSync(merged);
      return next;
    });
  },

  deleteAccountTrade: (accountId, tradeId) =>
    set(s => {
      const trades = (s.tradesByAccount[accountId] || []).filter(t => t.id !== tradeId);
      const next = { ...s, tradesByAccount: { ...s.tradesByAccount, [accountId]: trades } };
      persist(next);
      return next;
    }),

  updateAccountTrade: (accountId, tradeId, data) =>
    set(s => {
      const trades = (s.tradesByAccount[accountId] || [])
        .map(t => t.id === tradeId ? { ...t, ...data, updatedAt: new Date().toISOString() } : t);
      const next = { ...s, tradesByAccount: { ...s.tradesByAccount, [accountId]: trades } };
      persist(next);
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
