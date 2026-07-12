import { create } from "zustand";
import { persist } from "zustand/middleware";

async function syncToCloud(trades: any[]) {
  try {
    await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trades }),
    });
  } catch {}
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
import { Trade } from "@/types/trade";
import { loadTrades, saveTrades } from "@/lib/persistence";

export interface Account {
  id: string;
  name: string;
  startingBalance: number;
  color: string;         // accent color for the tab
  broker: string;
  createdAt: string;
}

interface AccountStore {
  accounts: Account[];
  activeAccountId: string;

  addAccount: (a: Omit<Account, "id"|"createdAt">) => string;
  updateAccount: (id: string, data: Partial<Account>) => void;
  deleteAccount: (id: string) => void;
  setActiveAccount: (id: string) => void;

  // Per-account trade storage
  tradesByAccount: Record<string, Trade[]>;
  getActiveTrades: () => Trade[];
  setAccountTrades: (accountId: string, trades: Trade[]) => void;
  addAccountTrades: (accountId: string, newTrades: Trade[]) => void;
  deleteAccountTrade: (accountId: string, tradeId: string) => void;
  updateAccountTrade: (accountId: string, tradeId: string, data: Partial<Trade>) => void;
}

const DEFAULT_ACCOUNT: Account = {
  id: "default",
  name: "Main Account",
  startingBalance: 10000,
  color: "#00e5ff",
  broker: "TradingView Paper",
  createdAt: new Date().toISOString(),
};

const COLORS = ["#00e5ff","#00e676","#d500f9","#ffab00","#ff6b35","#f9a8d4","#6ee7b7","#93c5fd"];

export const useAccountStore = create<AccountStore>()(
  persist(
    (set, get) => ({
      accounts: [DEFAULT_ACCOUNT],
      activeAccountId: "default",

      addAccount: (a) => {
        const id = Date.now().toString();
        const account: Account = { ...a, id, createdAt: new Date().toISOString() };
        set(s => ({ accounts: [...s.accounts, account] }));
        return id;
      },

      updateAccount: (id, data) =>
        set(s => ({ accounts: s.accounts.map(a => a.id === id ? { ...a, ...data } : a) })),

      deleteAccount: (id) => {
        const { accounts, activeAccountId, tradesByAccount } = get();
        // Never allow deleting the last remaining account
        if (accounts.length <= 1) return;
        const remaining = accounts.filter(a => a.id !== id);
        const newActive = activeAccountId === id ? remaining[0]?.id || remaining[0].id : activeAccountId;
        const { [id]: _, ...restTrades } = tradesByAccount;
        set({ accounts: remaining, activeAccountId: newActive, tradesByAccount: restTrades });
      },

      setActiveAccount: (id) => set({ activeAccountId: id }),

      tradesByAccount: { default: [] },

      getActiveTrades: () => {
        const { activeAccountId, tradesByAccount } = get();
        return tradesByAccount[activeAccountId] || [];
      },

      setAccountTrades: (accountId, trades) =>
        set(s => ({ tradesByAccount: { ...s.tradesByAccount, [accountId]: trades } })),

      addAccountTrades: (accountId, newTrades) => {
        const existing = get().tradesByAccount[accountId] || [];
        // Include price + side + exit so two scalps at the same second aren't
        // wrongly merged. Old key (ticker|entryTime|qty) silently dropped them.
        const fp = (t: Partial<Trade>) =>
          `${t.ticker}|${t.entryTime}|${t.exitTime ?? ""}|${t.side}|${t.quantity}|${t.entryPrice}|${t.exitPrice ?? ""}`;
        const seen = new Set(existing.map(fp));
        const fresh: Trade[] = [];
        for (const t of newTrades) {
          const k = fp(t);
          if (seen.has(k)) continue;
          seen.add(k);          // also dedupe within the incoming batch
          fresh.push(t);
        }
        const merged = [...fresh, ...existing];
        set(s => ({ tradesByAccount: { ...s.tradesByAccount, [accountId]: merged } }));
      },

      deleteAccountTrade: (accountId, tradeId) => {
        const trades = (get().tradesByAccount[accountId] || []).filter(t => t.id !== tradeId);
        set(s => ({ tradesByAccount: { ...s.tradesByAccount, [accountId]: trades } }));
      },

      updateAccountTrade: (accountId, tradeId, data) => {
        const trades = (get().tradesByAccount[accountId] || [])
          .map(t => t.id === tradeId ? { ...t, ...data, updatedAt: new Date().toISOString() } : t);
        set(s => ({ tradesByAccount: { ...s.tradesByAccount, [accountId]: trades } }));
      },
    }),
    {
      name: "tv-accounts-store",
      // User-scoped storage so trades never bleed across accounts.
      // Hydration runs normally on mount; the auth provider calls
      // loadUserData() on login to swap in the right user's data.
      storage: {
        getItem: (key: string) => {
          try {
            const uid = localStorage.getItem("th_current_user_id") || "";
            const raw = localStorage.getItem(uid ? `${key}__${uid}` : key);
            return raw ? JSON.parse(raw) : null;
          } catch { return null; }
        },
        setItem: (key: string, value: unknown) => {
          try {
            const uid = localStorage.getItem("th_current_user_id") || "";
            localStorage.setItem(uid ? `${key}__${uid}` : key, JSON.stringify(value));
          } catch {}
        },
        removeItem: (key: string) => {
          try {
            const uid = localStorage.getItem("th_current_user_id") || "";
            localStorage.removeItem(uid ? `${key}__${uid}` : key);
          } catch {}
        },
      },
    }
  )
);

// ── Manual per-user persistence ────────────────────────────────────────────────
const KEY_PREFIX = "th_accounts_v2_";

export function saveUserData(userId: string) {
  if (!userId) return;
  try {
    const s = useAccountStore.getState();
    localStorage.setItem(KEY_PREFIX + userId, JSON.stringify({
      accounts: s.accounts,
      activeAccountId: s.activeAccountId,
      tradesByAccount: s.tradesByAccount,
    }));
  } catch {}
}

export function loadUserData(userId: string) {
  const fresh = {
    accounts: [{ ...DEFAULT_ACCOUNT, createdAt: new Date().toISOString() }],
    activeAccountId: "default",
    tradesByAccount: {} as Record<string, Trade[]>,
  };
  if (!userId) { useAccountStore.setState(fresh); return; }
  try {
    const raw = localStorage.getItem(KEY_PREFIX + userId);
    if (!raw) { useAccountStore.setState(fresh); return; }
    const d = JSON.parse(raw);
    useAccountStore.setState({
      accounts: Array.isArray(d.accounts) && d.accounts.length ? d.accounts : fresh.accounts,
      activeAccountId: d.activeAccountId || "default",
      tradesByAccount: d.tradesByAccount || {},
    });
  } catch { useAccountStore.setState(fresh); }
}

export function clearUserData() {
  useAccountStore.setState({
    accounts: [{ ...DEFAULT_ACCOUNT, createdAt: new Date().toISOString() }],
    activeAccountId: "default",
    tradesByAccount: {},
  });
}

// Auto-save on state change (debounced — was firing on every keystroke)
if (typeof window !== "undefined") {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let syncTimer: ReturnType<typeof setTimeout> | null = null;

  useAccountStore.subscribe((state, prev) => {
    const uid = localStorage.getItem("th_current_user_id");
    if (!uid) return;

    // Debounce localStorage write
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveUserData(uid), 400);

    // Only sync to cloud when trades actually changed (not UI state)
    if (state.tradesByAccount !== prev.tradesByAccount) {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        const trades = state.tradesByAccount[state.activeAccountId] || [];
        if (trades.length) syncToCloud(trades);
      }, 2000);
    }
  });

  // Flush pending save before the tab closes
  window.addEventListener("beforeunload", () => {
    const uid = localStorage.getItem("th_current_user_id");
    if (uid) saveUserData(uid);
  });
}

export { COLORS as ACCOUNT_COLORS };
