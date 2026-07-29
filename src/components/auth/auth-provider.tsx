"use client";
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User } from "@supabase/supabase-js";
import { useAccountStore, loadUserData, clearUserData, saveUserData, mergeFromCloud } from "@/store/accounts";
import { useStore, reloadUIStore } from "@/store";
import { clearAllUserScoped } from "@/lib/user-storage";
import { createClient } from "@/lib/supabase";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  passwordRecovery: boolean;
  completePasswordRecovery: (newPassword: string) => Promise<{ error?: string }>;
  cancelPasswordRecovery: () => void;
}

const Ctx = createContext<AuthCtx>({
  user: null, loading: true, signOut: async () => {},
  passwordRecovery: false,
  completePasswordRecovery: async () => ({ error: "Not available" }),
  cancelPasswordRecovery: () => {},
});

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const hasSupabase = SUPABASE_URL.length > 0 && !SUPABASE_URL.includes("placeholder");

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(hasSupabase);
  // Set when Supabase redirects the user back after clicking a password-reset
  // email link. Blocks normal app access until they set a new password —
  // otherwise the recovery session just silently logs them in with no way
  // to actually change the password they forgot.
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    if (!hasSupabase) return;
    const mounted = { current: true };
    const supabase = createClient();

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted.current) return;
      if (error) console.error("[Auth] getSession error:", error.message);
      const sessionUser = data?.session?.user ?? null;
      if (sessionUser) {
        localStorage.setItem("th_current_user_id", sessionUser.id);
        loadUserData(sessionUser.id);
        reloadUIStore(sessionUser.id);
        mergeFromCloud(sessionUser.id);
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

      if (_event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
      }

      if (newUser) {
        localStorage.setItem("th_current_user_id", newUser.id);
        if (_event === "SIGNED_IN") {
          loadUserData(newUser.id);
          reloadUIStore(newUser.id);
          mergeFromCloud(newUser.id);
        }
      } else {
        // Save before clearing so trades survive logout
        const uid = localStorage.getItem("th_current_user_id");
        if (uid) saveUserData(uid);
        clearAllUserScoped();
        localStorage.removeItem("th_current_user_id");
        clearUserData();
      }

      setUser(newUser);
    });

    return () => { mounted.current = false; subscription.unsubscribe(); };
  }, []);

  const signOut = async () => {
    if (!hasSupabase) return;
    const supabase = createClient();
    // Save trades BEFORE clearing so they survive the logout
    const uid = localStorage.getItem("th_current_user_id");
    if (uid) saveUserData(uid);
    clearAllUserScoped();
    localStorage.removeItem("th_current_user_id");
    clearUserData();
    await supabase.auth.signOut();
    setUser(null);
  };

  const completePasswordRecovery = async (newPassword: string) => {
    if (!hasSupabase) return { error: "Not available" };
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message };
    setPasswordRecovery(false);
    return {};
  };

  const cancelPasswordRecovery = () => {
    // User backed out — sign them out of the recovery session rather than
    // leaving them stuck on the "set new password" screen.
    setPasswordRecovery(false);
    signOut();
  };

  return (
    <Ctx.Provider value={{ user, loading, signOut, passwordRecovery, completePasswordRecovery, cancelPasswordRecovery }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
