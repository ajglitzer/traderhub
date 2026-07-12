"use client";
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User } from "@supabase/supabase-js";
import { loadFromCloud, useAccountStore } from "@/store/accounts";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ user: null, loading: true, signOut: async () => {} });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const hasSupabase = SUPABASE_URL.length > 0 && !SUPABASE_URL.includes("placeholder");

const DEFAULT_STATE = {
  accounts: [{ id: "default", name: "Main Account", startingBalance: 10000, color: "#00e5ff", broker: "TraderHub", createdAt: new Date().toISOString() }],
  activeAccountId: "default",
  tradesByAccount: {},
};

function clearOtherUsersData(currentUserId: string) {
  // Remove all tv-accounts-store keys that aren't for this user
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("tv-accounts-store") && !k.endsWith(currentUserId)) {
        toRemove.push(k);
      }
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  } catch {}
}

function loadUserData(userId: string) {
  try {
    // Try user-scoped key first
    const scopedKey = `tv-accounts-store-${userId}`;
    const saved = localStorage.getItem(scopedKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.state) {
        useAccountStore.setState(parsed.state);
        return;
      }
    }
    // No data for this user — reset to defaults
    useAccountStore.setState(DEFAULT_STATE);
  } catch {
    useAccountStore.setState(DEFAULT_STATE);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(hasSupabase);

  useEffect(() => {
    if (!hasSupabase) return;
    let mounted = true;

    import("@/lib/supabase").then(({ createClient }) => {
      const supabase = createClient();

      supabase.auth.getSession().then(({ data, error }) => {
        if (!mounted) return;
        if (error) console.error("[Auth] getSession error:", error.message);
        const sessionUser = data?.session?.user ?? null;
        if (sessionUser) {
          localStorage.setItem("th_current_user_id", sessionUser.id);
          clearOtherUsersData(sessionUser.id);
          loadUserData(sessionUser.id);
          loadFromCloud().then(trades => {
            if (!mounted || trades.length === 0) return;
            const store = useAccountStore.getState();
            const activeId = store.activeAccountId;
            if (activeId) store.setAccountTrades(activeId, trades);
          });
        }
        setUser(sessionUser);
        setLoading(false);
      }).catch(err => {
        if (!mounted) return;
        console.error("[Auth] getSession failed:", err);
        setLoading(false);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!mounted) return;
        const newUser = session?.user ?? null;
        setLoading(false);

        if (newUser) {
          const prevId = localStorage.getItem("th_current_user_id");
          localStorage.setItem("th_current_user_id", newUser.id);

          if (_event === "SIGNED_IN") {
            clearOtherUsersData(newUser.id);
            loadUserData(newUser.id);
            if (prevId && prevId !== newUser.id) {
              // Different user logged in — force full reload for clean state
              window.location.reload();
              return;
            }
            loadFromCloud().then(trades => {
              if (!mounted || trades.length === 0) return;
              const store = useAccountStore.getState();
              const activeId = store.activeAccountId;
              if (activeId) store.setAccountTrades(activeId, trades);
            });
          }
        } else {
          // Logged out — wipe everything
          localStorage.removeItem("th_current_user_id");
          localStorage.removeItem("tv-accounts-store");
          useAccountStore.setState(DEFAULT_STATE);
        }

        setUser(newUser);
      });

      return () => { mounted = false; subscription.unsubscribe(); };
    });

    return () => { mounted = false; };
  }, []);

  const signOut = async () => {
    if (!hasSupabase) return;
    const { createClient } = await import("@/lib/supabase");
    const supabase = createClient();
    // Wipe local data before signing out
    localStorage.removeItem("th_current_user_id");
    localStorage.removeItem("tv-accounts-store");
    useAccountStore.setState(DEFAULT_STATE);
    await supabase.auth.signOut();
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
