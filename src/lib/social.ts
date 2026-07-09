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

// ── Profile ───────────────────────────────────────────────────────────────────
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

export async function searchProfiles(query: string): Promise<Profile[]> {
  const { data } = await sb().from("profiles").select("*")
    .ilike("username", `%${query}%`).limit(10);
  return data || [];
}

// ── Friends ───────────────────────────────────────────────────────────────────
export async function sendFriendRequest(fromId: string, toId: string): Promise<void> {
  await sb().from("friend_requests").insert({ from_id: fromId, to_id: toId });
}

export async function getFriendRequests(userId: string): Promise<FriendRequest[]> {
  const { data } = await sb().from("friend_requests")
    .select("*, from_profile:profiles!friend_requests_from_id_fkey(*), to_profile:profiles!friend_requests_to_id_fkey(*)")
    .or(`from_id.eq.${userId},to_id.eq.${userId}`)
    .order("created_at", { ascending: false });
  return (data || []) as FriendRequest[];
}

export async function respondToFriendRequest(id: string, status: "accepted" | "declined"): Promise<void> {
  await sb().from("friend_requests").update({ status }).eq("id", id);
}

export async function getFriends(userId: string): Promise<Profile[]> {
  const { data } = await sb().from("friend_requests")
    .select("*, from_profile:profiles!friend_requests_from_id_fkey(*), to_profile:profiles!friend_requests_to_id_fkey(*)")
    .or(`from_id.eq.${userId},to_id.eq.${userId}`)
    .eq("status", "accepted");
  if (!data) return [];
  return data.map((r: any) => r.from_id === userId ? r.to_profile : r.from_profile).filter(Boolean);
}

// ── Messages ──────────────────────────────────────────────────────────────────
export async function getMessages(userId: string, otherId: string): Promise<Message[]> {
  const { data } = await sb().from("messages")
    .select("*, from_profile:profiles!messages_from_id_fkey(*)")
    .or(`and(from_id.eq.${userId},to_id.eq.${otherId}),and(from_id.eq.${otherId},to_id.eq.${userId})`)
    .order("created_at", { ascending: true });
  return (data || []) as Message[];
}

export async function sendMessage(fromId: string, toId: string, content: string, type: Message["type"] = "text", metadata?: Record<string,any>): Promise<void> {
  const { filterMessage } = await import("@/lib/profanity");
  const check = filterMessage(content);
  if (!check.ok) throw new Error(check.reason || "Message not allowed");
  await sb().from("messages").insert({ from_id: fromId, to_id: toId, content, type, metadata: metadata || null });
}

export async function markMessagesRead(userId: string, fromId: string): Promise<void> {
  await sb().from("messages").update({ read: true }).eq("to_id", userId).eq("from_id", fromId).eq("read", false);
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { count } = await sb().from("messages").select("*", { count: "exact", head: true }).eq("to_id", userId).eq("read", false);
  return count || 0;
}

export async function getConversations(userId: string): Promise<{profile: Profile; lastMessage: Message; unread: number}[]> {
  const { data } = await sb().from("messages")
    .select("*, from_profile:profiles!messages_from_id_fkey(*)")
    .or(`from_id.eq.${userId},to_id.eq.${userId}`)
    .order("created_at", { ascending: false });
  if (!data) return [];
  const seen = new Set<string>();
  const convos: {profile: Profile; lastMessage: Message; unread: number}[] = [];
  for (const msg of data as Message[]) {
    const otherId = msg.from_id === userId ? msg.to_id : msg.from_id;
    if (seen.has(otherId)) continue;
    seen.add(otherId);
    const { data: profile } = await sb().from("profiles").select("*").eq("id", otherId).single();
    if (!profile) continue;
    const { count } = await sb().from("messages").select("*",{count:"exact",head:true}).eq("to_id",userId).eq("from_id",otherId).eq("read",false);
    convos.push({ profile, lastMessage: msg as Message, unread: count || 0 });
  }
  return convos;
}

// ── Battles ───────────────────────────────────────────────────────────────────
export async function sendBattleRequest(challengerId: string, opponentId: string, symbol: string): Promise<string> {
  const { data } = await sb().from("battles").insert({ challenger_id: challengerId, opponent_id: opponentId, symbol }).select().single();
  return data?.id;
}

export async function getBattles(userId: string): Promise<Battle[]> {
  const { data } = await sb().from("battles")
    .select("*, challenger_profile:profiles!battles_challenger_id_fkey(*), opponent_profile:profiles!battles_opponent_id_fkey(*)")
    .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
    .order("created_at", { ascending: false });
  return (data || []) as Battle[];
}

export async function respondToBattle(battleId: string, accept: boolean): Promise<void> {
  await sb().from("battles").update({ status: accept ? "active" : "declined" }).eq("id", battleId);
}

export async function submitBattleTrades(battleId: string, userId: string, challengerId: string, trades: BattleTrade[]): Promise<void> {
  const score = trades.reduce((a,t) => a + t.pnl, 0);
  const field = userId === challengerId ? { challenger_trades: trades, challenger_score: score } : { opponent_trades: trades, opponent_score: score };
  await sb().from("battles").update(field).eq("id", battleId);
}

export async function finalizeBattle(battle: Battle): Promise<void> {
  if (battle.challenger_score === null || battle.opponent_score === null) return;
  const winnerId = battle.challenger_score >= battle.opponent_score ? battle.challenger_id : battle.opponent_id;
  await sb().from("battles").update({ status: "completed", winner_id: winnerId, completed_at: new Date().toISOString() }).eq("id", battle.id);
}

// ── localStorage fallback for when Supabase auth not used ────────────────────
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

// ── Leaderboard via Supabase ──────────────────────────────────────────────────
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
    const { data } = await sb().from("sim_leaderboard")
      .select("*").order("balance", { ascending: false }).limit(50);
    return data || [];
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
