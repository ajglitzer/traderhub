// Basic profanity/inappropriate content filter
const BAD_WORDS = [
  "fuck","shit","ass","bitch","cunt","dick","cock","pussy","nigger","nigga",
  "faggot","fag","retard","whore","slut","bastard","damn","hell","piss",
  "asshole","motherfucker","fucker","bullshit","crap","nazi","rape","kill",
  "n1gger","f4g","sh1t","fuk","b1tch","kys","hate"
];

export function containsProfanity(text: string): boolean {
  const clean = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  return BAD_WORDS.some(w => clean.includes(w.replace(/[^a-z0-9]/g, "")));
}

export function filterMessage(text: string): { ok: boolean; reason?: string } {
  if (containsProfanity(text)) return { ok: false, reason: "Message contains inappropriate content" };
  if (text.length > 2000) return { ok: false, reason: "Message too long (max 2000 chars)" };
  // Basic XSS prevention
  if (/<script|javascript:|on\w+=/i.test(text)) return { ok: false, reason: "Invalid content" };
  return { ok: true };
}

export function filterUsername(username: string): { ok: boolean; reason?: string } {
  if (containsProfanity(username)) return { ok: false, reason: "Username contains inappropriate words" };
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return { ok: false, reason: "Username must be 3-20 chars, letters/numbers/underscore only" };
  return { ok: true };
}
