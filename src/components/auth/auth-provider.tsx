"use client";
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User } from "@supabase/supabase-js";
import { useAccountStore, loadUserData, clearUserData } from "@/store/accounts";
import { useStore, reloadUIStore } from "@/store";
import { clearAllUserScoped } from "@/lib/user-storage";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ user: null, loading: true, signOut: async () => {} });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const hasSupabase = SUPABASE_URL.length > 0 && !SUPABASE_URL.includes("placeholder");

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(hasSupabase);

  useEffect(() => {
    if (!hasSupabase) return;
    const mounted = { current: true };

    import("@/lib/supabase").then(({ createClient }) => {
      const supabase = createClient();

      supabase.auth.getSession().then(({ data, error }) => {
        if (!mounted.current) return;
        if (error) console.error("[Auth] getSession error:", error.message);
        const sessionUser = data?.session?.user ?? null;
        if (sessionUser) {
          localStorage.setItem("th_current_user_id", sessionUser.id);
          loadUserData(sessionUser.id);
          reloadUIStore(sessionUser.id);
        }
        setUser(sessionUser);
        setLoading(false);
      }).catch(err => {
        if (!mounted.current) return;
        console.error("[Auth] getSession failed:", err);
        setLoading(false);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!mounted.current) return;
        const newUser = session?.user ?? null;
        setLoading(false);

        if (newUser) {
          localStorage.setItem("th_current_user_id", newUser.id);
          if (_event === "SIGNED_IN") {
            loadUserData(newUser.id);
            reloadUIStore(newUser.id);
          }
        } else {
          clearAllUserScoped();
          localStorage.removeItem("th_current_user_id");
          clearUserData();
        }

        setUser(newUser);
      });

      return () => { mounted.current = false; subscription.unsubscribe(); };
    });

    return () => { mounted.current = false; };
  }, []);

  const signOut = async () => {
    if (!hasSupabase) return;
    const { createClient } = await import("@/lib/supabase");
    const supabase = createClient();
    clearAllUserScoped();
    localStorage.removeItem("th_current_user_id");
    clearUserData();
    await supabase.auth.signOut();
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
