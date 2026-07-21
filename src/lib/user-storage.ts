// User-scoped localStorage helpers.
// Every key that stores per-user data MUST go through these so data
// doesn't bleed across accounts when switching users.

export function currentUserId(): string {
  try { return localStorage.getItem("th_current_user_id") || ""; } catch { return ""; }
}

/** Returns a user-scoped key, e.g. "th_journal" -> "th_journal__abc123" */
export function scopedKey(base: string): string {
  const uid = currentUserId();
  return uid ? `${base}__${uid}` : base;
}

export function getScoped<T>(base: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(scopedKey(base));
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

export function setScoped(base: string, value: unknown): void {
  try { localStorage.setItem(scopedKey(base), JSON.stringify(value)); } catch {}
}

export function removeScoped(base: string): void {
  try { localStorage.removeItem(scopedKey(base)); } catch {}
}

/** The signed-in user's community username, if they've set one.
 * Note: uses the "th_username_<uid>" convention (single underscore), set at
 * signup — a different naming scheme than the "__uid" scopedKey() above. */
export function getStoredUsername(): string | undefined {
  const uid = currentUserId();
  if (!uid) return undefined;
  try { return localStorage.getItem(`th_username_${uid}`) || undefined; } catch { return undefined; }
}

/** Wipe every scoped key for the current user (call on logout).
 * NOTE: excludes the accounts/trades key so trades survive logout. */
export function clearAllUserScoped(): void {
  const uid = currentUserId();
  if (!uid) return;
  try {
    const keep = new Set([
      `th_accts__${uid}`,   // trades — must survive logout
    ]);
    const kill: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.endsWith(`__${uid}`) && !keep.has(k)) kill.push(k);
    }
    kill.forEach(k => localStorage.removeItem(k));
  } catch {}
}
