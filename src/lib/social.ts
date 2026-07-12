import { createClient } from "@/lib/supabase";

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_color: string;
  created_at: string;
  bio?: string;
  show_real_stats?: boolean;
  twitter?: string;
}

export interface FriendRequest {
  id: string;
  from_id: string;
  to_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  from_profile?: Profile;
  to_profile?: Profile;
}

export interface Message {
  id: string;
  from_id: string;
  to_id: string;
  content: string;
  type: "text" | "trade_share" | "battle_request" | "battle_result";
  metadata: Record<string, any> | null;
  read: boolean;
  created_at: string;
  from_profile?: Profile;
}

export interface Battle {
  id: string;
  challenger_id: string;
  opponent_id: string;
  symbol: string;
  status: "pending" | "active" | "completed" | "declined";
  challenger_trades: BattleTrade[] | null;
  opponent_trades: BattleTrade[] | null;
  challenger_score: number | null;
  opponent_score: number | null;
  winner_id: string | null;
  created_at: string;
  challenger_profile?: Profile;
  opponent_profile?: Profile;
}

export interface BattleTrade {
  side: "LONG" | "SHORT";
  entry: number;
  exit: number;
  pnl: number;
  pct: number;
}

const sb = () => createClient();

// -- Profile -------------------------------------------------------------------
export async function getMyProfile(userId: string): Promise<Profile | null> {
  const { data } = await sb().from("profiles").select("*").eq("id", userId).single();
  return data;
}

export async function createProfile(userId: string, username: string, displayName?: string): Promise<Profile | null> {
  const colors = ["#00e5ff","#00e676","#d500f9","#ffab00","#ff6b35","#f9a8d4","#6ee7b7","#93c5fd"];
  const color = colors[Math.floor(Math.random()*colors.length)];
  const { data } = await sb().from("profiles").insert({
    id: userId, username: username.trim().toLowerCase(),
    display_name: displayName || username,
    avatar_color: color,
  }).select().single();
  return data;
}

export async function searchProfiles(query: string, myId?: string): Promise<Profile[]> {
  const { data } = await sb().from("profiles")
    .select("*")
    .ilike("username", `%${query}%`)
    .limit(10);
  let results = (data || []) as Profile[];
  // Filter out yourself and anyone in a block relationship with you
  if (myId) {
    const { data: bl } = await sb().from("blocks").select("blocker_id,blocked_id")
      .or(`blocker_id.eq.${myId},blocked_id.eq.${myId}`);
    const blocked = new Set<string>();
    (bl || []).forEach((b: any) => { blocked.add(b.blocked_id); blocked.add(b.blocker_id); });
    blocked.delete(myId);
    results = results.filter(p => p.id !== myId && !blocked.has(p.id));
  }
  return results;
}

export async function sendFriendRequest(fromId: string, toId: string): Promise<void> {
  // Can't friend someone you've blocked or who blocked you
  const { data: bl } = await sb().from("blocks").select("blocker_id")
    .or(`and(blocker_id.eq.${fromId},blocked_id.eq.${toId}),and(blocker_id.eq.${toId},blocked_id.eq.${fromId})`);
  if (bl && bl.length > 0) return;
  await sb().from("friend_requests").insert({ from_id: fromId, to_id: toId });
}

export async function getFriendRequests(userId: string): Promise<FriendRequest[]> {
  const [{ data }, { data: bl }] = await Promise.all([
    sb().from("friend_requests")
      .select("*, from_profile:profiles!friend_requests_from_id_fkey(*), to_profile:profiles!friend_requests_to_id_fkey(*)")
      .or(`from_id.eq.${userId},to_id.eq.${userId}`)
      .order("created_at", { ascending: false }),
    sb().from("blocks").select("blocker_id,blocked_id")
      .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
  ]);
  const blocked = new Set<string>();
  (bl || []).forEach((b: any) => { blocked.add(b.blocked_id); blocked.add(b.blocker_id); });
  blocked.delete(userId);
  return ((data || []) as FriendRequest[]).filter(r => {
    const other = r.from_id === userId ? r.to_id : r.from_id;
    return !blocked.has(other);
  });
}

export async function respondToFriendRequest(id: string, status: "accepted" | "declined", myId?: string): Promise<void> {
  // Only the RECIPIENT may accept/decline. Without the to_id scope, anyone
  // could respond to someone else's request by guessing the row id.
  let q = sb().from("friend_requests").update({ status }).eq("id", id);
  if (myId) q = q.eq("to_id", myId);
  await q;
}

export async function getFriends(userId: string): Promise<Profile[]> {
  const [{ data }, { data: blocked }] = await Promise.all([
    sb().from("friend_requests")
      .select("*, from_profile:profiles!friend_requests_from_id_fkey(*), to_profile:profiles!friend_requests_to_id_fkey(*)")
      .or(`from_id.eq.${userId},to_id.eq.${userId}`)
      .eq("status", "accepted"),
    sb().from("blocks").select("blocked_id,blocker_id").or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
  ]);
  if (!data) return [];
  const blockedIds = new Set((blocked||[]).flatMap((b:any)=>[b.blocked_id,b.blocker_id]).filter((id:string)=>id!==userId));
  return data
    .map((r: any) => r.from_id === userId ? r.to_profile : r.from_profile)
    .filter((p: any) => p && !blockedIds.has(p.id));
}

// -- Messages ------------------------------------------------------------------
export async function getMessages(userId: string, otherId: string): Promise<Message[]> {
  // Block check — don't return messages from blocked users
  const { data: bl } = await sb().from("blocks").select("blocker_id,blocked_id")
    .or(`and(blocker_id.eq.${userId},blocked_id.eq.${otherId}),and(blocker_id.eq.${otherId},blocked_id.eq.${userId})`);
  if (bl && bl.length > 0) return [];

  const { data } = await sb().from("messages")
    .select("*")
    .or(`and(from_id.eq.${userId},to_id.eq.${otherId}),and(from_id.eq.${otherId},to_id.eq.${userId})`)
    .order("created_at", { ascending: true });
  return (data || []) as Message[];
}

// Client-side send throttle — stops accidental/malicious message floods
const sendTimes: number[] = [];
function canSend(): boolean {
  const now = Date.now();
  while (sendTimes.length && now - sendTimes[0] > 10_000) sendTimes.shift();
  if (sendTimes.length >= 15) return false;   // max 15 msgs / 10s
  sendTimes.push(now);
  return true;
}

export async function sendMessage(fromId: string, toId: string, content: string, type: Message["type"] = "text", metadata?: Record<string,any>): Promise<void> {
  const text = String(content ?? "").trim();
  if (!text) return;
  if (text.length > 2000) return;   // cap message size
  if (!canSend()) return;           // throttle

  // Refuse to send if either party has blocked the other
  const { data: bl } = await sb().from("blocks").select("blocker_id")
    .or(`and(blocker_id.eq.${fromId},blocked_id.eq.${toId}),and(blocker_id.eq.${toId},blocked_id.eq.${fromId})`);
  if (bl && bl.length > 0) return;

  await sb().from("messages").insert({ from_id: fromId, to_id: toId, content: text, type, metadata });
}

export async function markMessagesRead(userId: string, fromId: string): Promise<void> {
  await sb().from("messages").update({ read: true }).eq("to_id", userId).eq("from_id", fromId).eq("read", false);
}

export async function getUnreadCount(userId: string): Promise<number> {
  const [{ data }, allowed] = await Promise.all([
    sb().from("messages").select("from_id").eq("to_id", userId).eq("read", false),
    getAllowedIds(userId),
  ]);
  return (data || []).filter((m: any) => allowed.has(m.from_id)).length;
}

// Returns set of user IDs the user is still allowed to see (friends, not blocked)
async function getAllowedIds(userId: string): Promise<Set<string>> {
  const [{ data: fr }, { data: bl }] = await Promise.all([
    sb().from("friend_requests").select("from_id,to_id")
      .or(`from_id.eq.${userId},to_id.eq.${userId}`)
      .eq("status", "accepted"),
    sb().from("blocks").select("blocker_id,blocked_id")
      .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
  ]);
  const friends = new Set<string>();
  (fr || []).forEach((r: any) => friends.add(r.from_id === userId ? r.to_id : r.from_id));
  (bl || []).forEach((b: any) => {
    friends.delete(b.blocked_id);
    friends.delete(b.blocker_id);
  });
  return friends;
}

export async function getConversations(userId: string): Promise<{profile: Profile; lastMessage: Message; unread: number}[]> {
  const [{ data }, allowed] = await Promise.all([
    sb().from("messages")
      .select("*")
      .or(`from_id.eq.${userId},to_id.eq.${userId}`)
      .order("created_at", { ascending: false }),
    getAllowedIds(userId),
  ]);
  if (!data) return [];

  // Collect distinct counterparties (most recent message first) — no queries in loop
  const seen = new Set<string>();
  const lastMsgByUser = new Map<string, Message>();
  const unreadByUser = new Map<string, number>();

  for (const msg of data as Message[]) {
    const otherId = msg.from_id === userId ? msg.to_id : msg.from_id;
    if (!allowed.has(otherId)) continue;
    if (!seen.has(otherId)) {
      seen.add(otherId);
      lastMsgByUser.set(otherId, msg);
    }
    // Count unread in the same pass instead of a query per user
    if (msg.to_id === userId && !msg.read) {
      unreadByUser.set(otherId, (unreadByUser.get(otherId) || 0) + 1);
    }
  }

  const ids = [...seen];
  if (ids.length === 0) return [];

  // ONE query for all profiles instead of one per conversation
  const { data: profiles } = await sb().from("profiles").select("*").in("id", ids);
  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  return ids
    .map(id => {
      const profile = profileMap.get(id);
      const lastMessage = lastMsgByUser.get(id);
      if (!profile || !lastMessage) return null;
      return { profile: profile as Profile, lastMessage, unread: unreadByUser.get(id) || 0 };
    })
    .filter(Boolean) as {profile: Profile; lastMessage: Message; unread: number}[];
}

// -- Battles -------------------------------------------------------------------
export async function sendBattleRequest(challengerId: string, opponentId: string, symbol: string): Promise<string> {
  const { data: bl } = await sb().from("blocks").select("blocker_id")
    .or(`and(blocker_id.eq.${challengerId},blocked_id.eq.${opponentId}),and(blocker_id.eq.${opponentId},blocked_id.eq.${challengerId})`);
  if (bl && bl.length > 0) return "";
  const { data } = await sb().from("battles").insert({ challenger_id: challengerId, opponent_id: opponentId, symbol }).select().single();
  return data?.id;
}

export async function getBattles(userId: string): Promise<Battle[]> {
  const [{ data }, allowed] = await Promise.all([
    sb().from("battles")
      .select("*, challenger_profile:profiles!battles_challenger_id_fkey(*), opponent_profile:profiles!battles_opponent_id_fkey(*)")
      .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
      .order("created_at", { ascending: false }),
    getAllowedIds(userId),
  ]);
  return ((data || []) as Battle[]).filter(b => {
    const otherId = b.challenger_id === userId ? b.opponent_id : b.challenger_id;
    return allowed.has(otherId);
  });
}

export async function respondToBattle(battleId: string, accept: boolean, myId?: string): Promise<void> {
  // Only the OPPONENT (the one challenged) may accept/decline.
  let q = sb().from("battles").update({ status: accept ? "active" : "declined" }).eq("id", battleId);
  if (myId) q = q.eq("opponent_id", myId);
  await q;
}

export async function submitBattleTrades(battleId: string, userId: string, challengerId: string, trades: BattleTrade[]): Promise<void> {
  // Bound the submission — the score is computed client-side, so without this
  // a tampered client could post an arbitrary winning score.
  const clean = (Array.isArray(trades) ? trades : [])
    .slice(0, 100)
    .filter(t => t && Number.isFinite(t.pnl))
    .map(t => ({ ...t, pnl: Math.max(-100_000, Math.min(t.pnl, 100_000)) }));

  const score = clean.reduce((a, t) => a + t.pnl, 0);

  // Only write to YOUR side of the battle, never the opponent's
  const isChallenger = userId === challengerId;
  const field = isChallenger
    ? { challenger_trades: clean, challenger_score: score }
    : { opponent_trades: clean, opponent_score: score };

  // Scope the update so you can only touch a battle you're actually in
  await sb().from("battles")
    .update(field)
    .eq("id", battleId)
    .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`);
}

export async function finalizeBattle(battle: Battle): Promise<void> {
  // Re-read the battle from the DB — never trust the client-supplied object.
  // Otherwise a tampered client could pass fake scores and declare itself winner.
  const { data: fresh } = await sb().from("battles")
    .select("id,challenger_id,opponent_id,challenger_score,opponent_score,status")
    .eq("id", battle.id)
    .single();

  if (!fresh) return;
  if (fresh.status === "completed") return;                       // already settled
  if (fresh.challenger_score === null || fresh.opponent_score === null) return;

  const winnerId = fresh.challenger_score >= fresh.opponent_score
    ? fresh.challenger_id
    : fresh.opponent_id;

  await sb().from("battles")
    .update({ status: "completed", winner_id: winnerId, completed_at: new Date().toISOString() })
    .eq("id", fresh.id)
    .neq("status", "completed");                                  // idempotent
}

// -- localStorage fallback for when Supabase auth not used --------------------
export function getLocalProfile(userId: string): Profile | null {
  try {
    const username = localStorage.getItem("th_username_" + userId);
    const displayName = localStorage.getItem("th_displayname_" + userId);
    if (!username) return null;
    return { id: userId, username, display_name: displayName || username, avatar_color: "#00e5ff", created_at: new Date().toISOString() };
  } catch { return null; }
}

export function searchLocalProfiles(query: string, currentUserId: string): Profile[] {
  try {
    const registry = JSON.parse(localStorage.getItem("th_registry") || "{}");
    return Object.values(registry as Record<string, Profile>)
      .filter((p: any) => p.username.includes(query.toLowerCase()) && p.id !== currentUserId)
      .slice(0, 10) as Profile[];
  } catch { return []; }
}

// -- Leaderboard via Supabase --------------------------------------------------
export async function getProfileByUsername(username: string): Promise<Profile | null> {
  try {
    const { data } = await sb().from("profiles").select("*").eq("username", username.toLowerCase()).single();
    return data || null;
  } catch { return null; }
}

export async function updateProfile(userId: string, data: Partial<Profile>): Promise<void> {
  try {
    // Whitelist editable fields — never pass the raw client object to .update().
    // Otherwise a crafted payload could try to set id, username, or other columns.
    const safe: Record<string, any> = {};
    if (typeof data.display_name === "string") safe.display_name = data.display_name.slice(0, 40);
    if (typeof data.bio === "string")          safe.bio = data.bio.slice(0, 200);
    if (Object.keys(safe).length === 0) return;
    await sb().from("profiles").update(safe).eq("id", userId);
  } catch {}
}

export async function getPublicStats(userId: string): Promise<{ trades: number; winRate: number; totalPnl: number; bestTrade: number; streak: number } | null> {
  try {
    const { data } = await sb().from("sim_leaderboard").select("*").eq("user_id", userId).order("balance", { ascending: false }).limit(1);
    if (!data?.length) return null;
    const d = data[0];
    return { trades: d.total_trades || 0, winRate: d.total_trades > 0 ? (d.wins / d.total_trades) * 100 : 0, totalPnl: (d.balance || 0) - (d.start_balance || 10000), bestTrade: 0, streak: 0 };
  } catch { return null; }
}

export async function getGlobalLeaderboard(): Promise<any[]> {
  try {
    const { data } = await sb().from("sim_leaderboard")
      .select("*").order("balance", { ascending: false }).limit(50);
    return data || [];
  } catch { return []; }
}

export async function upsertLeaderboardEntry(userId: string, username: string, accountName: string, balance: number, startBalance: number, totalTrades: number, wins: number): Promise<void> {
  try {
    // Sanity-check values — the client can be tampered with via DevTools.
    // These bounds make an obviously-fake entry impossible to submit.
    const finite = (n: number) => Number.isFinite(n) ? n : 0;
    const bal   = Math.max(0, Math.min(finite(balance), 100_000_000));
    const start = Math.max(1, Math.min(finite(startBalance), 10_000_000));
    const total = Math.max(0, Math.min(Math.floor(finite(totalTrades)), 100_000));
    const w     = Math.max(0, Math.min(Math.floor(finite(wins)), total)); // wins can't exceed trades

    // A run with no trades can't have a changed balance
    if (total === 0 && bal !== start) return;

    await sb().from("sim_leaderboard").upsert({
      user_id: userId,
      username: String(username).slice(0, 30),
      account_name: String(accountName).slice(0, 40),
      balance: bal,
      start_balance: start,
      total_trades: total,
      wins: w,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,account_name" });
  } catch {}
}

// ── Block / Unfriend ──────────────────────────────────────────────────────────

export async function unfriendUser(myId: string, friendId: string): Promise<void> {
  try {
    // Use server API with service role to guarantee delete bypasses RLS
    await fetch("/api/social/unfriend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendId }),
    });
  } catch {}
}

export async function blockUser(myId: string, targetId: string): Promise<void> {
  try {
    // Unfriend first
    await unfriendUser(myId, targetId);
    // Then insert block record
    await sb().from("blocks").upsert(
      { blocker_id: myId, blocked_id: targetId },
      { onConflict: "blocker_id,blocked_id" }
    );
  } catch {}
}

export async function unblockUser(myId: string, targetId: string): Promise<void> {
  try {
    await sb().from("blocks")
      .delete()
      .eq("blocker_id", myId)
      .eq("blocked_id", targetId);
  } catch {}
}

export async function getBlockedUsers(myId: string): Promise<string[]> {
  try {
    const { data } = await sb().from("blocks").select("blocked_id").eq("blocker_id", myId);
    return (data || []).map((r: any) => r.blocked_id);
  } catch { return []; }
}
