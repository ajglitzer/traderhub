import { create } from "zustand";
import { Trade } from "@/types/trade";

// ── Cloud sync (debounced) ────────────────────────────────────────────────────
let cloudTimer: ReturnType<typeof setTimeout> | null = null;
function queueCloudSync(trades: any[]) {
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

export async function deleteFromCloud(id: string) {
  try {
    await fetch("/api/sync", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  } catch {}
}

// ── Types ─────────────────────────────────────────────────────────────────────
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

  addAccount: (a: Omit<Account, "id"|"createdAt">) => string;
  updateAccount: (id: string, data: Partial<Account>) => void;
  deleteAccount: (id: string) => void;
  setActiveAccount: (id: string) => void;

  getActiveTrades: () => Trade[];
  setAccountTrades: (accountId: string, trades: Trade[]) => void;
  addAccountTrades: (accountId: string, newTrades: Trade[]) => void;
  deleteAccountTrade: (accountId: string, tradeId: string) => void;
  updateAccountTrade: (accountId: string, tradeId: string, data: Partial<Trade>) => void;
}

export const DEFAULT_ACCOUNT: Account = {
  id: "default",
  name: "Main Account",
  startingBalance: 10000,
  color: "#00e5ff",
  broker: "TradingView Paper",
  createdAt: new Date().toISOString(),
};

export const COLORS = ["#00e5ff","#00e676","#d500f9","#ffab00","#ff6b35","#f9a8d4","#6ee7b7","#93c5fd"];

// ── Storage key (user-scoped) ─────────────────────────────────────────────────
const STORE_KEY = "th_accts_v3"; // bump version to avoid stale data

function storageKey(): string {
  const uid = typeof window !== "undefined"
    ? (localStorage.getItem("th_current_user_id") || "")
    : "";
  return uid ? `${STORE_KEY}__${uid}` : STORE_KEY;
}

// ── Manual save — called explicitly after every mutation ──────────────────────
function saveState(state: Pick<AccountStore, "accounts"|"activeAccountId"|"tradesByAccount">) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify({
      accounts:        state.accounts,
      activeAccountId: state.activeAccountId,
      tradesByAccount: state.tradesByAccount,
    }));
  } catch {}
}

// ── Public API for auth-provider ──────────────────────────────────────────────
const FRESH = () => ({
  accounts: [{ ...DEFAULT_ACCOUNT, createdAt: new Date().toISOString() }],
  activeAccountId: "default",
  tradesByAccount: { default: [] } as Record<string, Trade[]>,
});

export function loadUserData(userId: string) {
  if (!userId) { useAccountStore.setState(FRESH()); return; }
  try {
    const key = `${STORE_KEY}__${userId}`;
    const raw = localStorage.getItem(key);
    if (!raw) { useAccountStore.setState(FRESH()); return; }
    const d = JSON.parse(raw);
    useAccountStore.setState({
      accounts: Array.isArray(d.accounts) && d.accounts.length ? d.accounts : FRESH().accounts,
      activeAccountId: d.activeAccountId || "default",
      tradesByAccount: d.tradesByAccount || { default: [] },
    });
  } catch { useAccountStore.setState(FRESH()); }
}

export function clearUserData() {
  useAccountStore.setState(FRESH());
}

export function saveUserData(userId: string) {
  if (!userId) return;
  try {
    const s = useAccountStore.getState();
    localStorage.setItem(`${STORE_KEY}__${userId}`, JSON.stringify({
      accounts:        s.accounts,
      activeAccountId: s.activeAccountId,
      tradesByAccount: s.tradesByAccount,
    }));
  } catch {}
}

// ── Store (no persist middleware — it re-hydrates on every mount and causes ───
// ── flashing when the user-scoped key isn't set yet at module load time) ──────
export const useAccountStore = create<AccountStore>()((set, get) => ({
  ...FRESH(),

  addAccount: (a) => {
    const id = Date.now().toString();
    const account: Account = { ...a, id, createdAt: new Date().toISOString() };
    set(s => {
      const next = { ...s, accounts: [...s.accounts, account] };
      saveState(next);
      return next;
    });
    return id;
  },

  updateAccount: (id, data) =>
    set(s => {
      const next = { ...s, accounts: s.accounts.map(a => a.id === id ? { ...a, ...data } : a) };
      saveState(next);
      return next;
    }),

  deleteAccount: (id) => {
    const { accounts, activeAccountId, tradesByAccount } = get();
    if (accounts.length <= 1) return;
    const remaining = accounts.filter(a => a.id !== id);
    const newActive = activeAccountId === id ? remaining[0]?.id : activeAccountId;
    const { [id]: _, ...restTrades } = tradesByAccount;
    const next = { accounts: remaining, activeAccountId: newActive || "default", tradesByAccount: restTrades };
    set(next);
    saveState({ ...get(), ...next });
  },

  setActiveAccount: (id) => {
    set({ activeAccountId: id });
    saveState({ ...get(), activeAccountId: id });
  },

  getActiveTrades: () => {
    const { activeAccountId, tradesByAccount } = get();
    return (tradesByAccount ?? {})[activeAccountId] || [];
  },

  setAccountTrades: (accountId, trades) => {
    set(s => {
      const next = { ...s, tradesByAccount: { ...s.tradesByAccount, [accountId]: trades } };
      saveState(next);
      queueCloudSync(trades);
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
      saveState(next);
      queueCloudSync(merged);
      return next;
    });
  },

  deleteAccountTrade: (accountId, tradeId) => {
    const trades = (get().tradesByAccount[accountId] || []).filter(t => t.id !== tradeId);
    set(s => {
      const next = { ...s, tradesByAccount: { ...s.tradesByAccount, [accountId]: trades } };
      saveState(next);
      return next;
    });
  },

  updateAccountTrade: (accountId, tradeId, data) => {
    const trades = (get().tradesByAccount[accountId] || [])
      .map(t => t.id === tradeId ? { ...t, ...data, updatedAt: new Date().toISOString() } : t);
    set(s => {
      const next = { ...s, tradesByAccount: { ...s.tradesByAccount, [accountId]: trades } };
      saveState(next);
      return next;
    });
  },
}));

export { COLORS as ACCOUNT_COLORS };
