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
  type: "text" | "trade_share";
  metadata: Record<string, any> | null;
  read: boolean;
  created_at: string;
  from_profile?: Profile;
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

export async function respondToFriendRequest(id: string, status: "accepted" | "declined"): Promise<void> {
  await sb().from("friend_requests").update({ status }).eq("id", id);
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

export async function sendMessage(fromId: string, toId: string, content: string, type: Message["type"] = "text", metadata?: Record<string,any>): Promise<void> {
  // Refuse to send if either party has blocked the other
  const { data: bl } = await sb().from("blocks").select("blocker_id")
    .or(`and(blocker_id.eq.${fromId},blocked_id.eq.${toId}),and(blocker_id.eq.${toId},blocked_id.eq.${fromId})`);
  if (bl && bl.length > 0) return;

  await sb().from("messages").insert({ from_id: fromId, to_id: toId, content, type, metadata });
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
  try { await sb().from("profiles").update(data).eq("id", userId); } catch {}
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
    // Overfetch, then filter to only users who opted in to sharing stats
    // (profiles.show_real_stats) — same flag that gates their public profile
    // page, so the leaderboard can't leak balance/P&L for users who turned it off.
    const { data } = await sb().from("sim_leaderboard")
      .select("*").order("balance", { ascending: false }).limit(200);
    const entries = data || [];
    if (!entries.length) return [];

    const userIds = [...new Set(entries.map((e: any) => e.user_id))];
    const { data: profiles } = await sb().from("profiles")
      .select("id,show_real_stats").in("id", userIds);
    const opted = new Set((profiles || []).filter((p: any) => p.show_real_stats).map((p: any) => p.id));

    return entries.filter((e: any) => opted.has(e.user_id)).slice(0, 50);
  } catch { return []; }
}

export async function upsertLeaderboardEntry(userId: string, username: string, accountName: string, balance: number, startBalance: number, totalTrades: number, wins: number): Promise<void> {
  try {
    await sb().from("sim_leaderboard").upsert({
      user_id: userId, username, account_name: accountName,
      balance, start_balance: startBalance, total_trades: totalTrades, wins,
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
