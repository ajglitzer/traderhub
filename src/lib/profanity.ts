import { Filter } from "bad-words";

const filter = new Filter();

// Add extra slurs and variants the library might miss
filter.addWords(
  "nigga","nigger","n1gga","n1gger","nigg4","niqqa","niqger",
  "faggot","fag","f4g","f4ggot","fаggot",
  "retard","r3tard","kys","tranny","chink","spic","wetback",
  "beaner","gook","zipperhead","towelhead","sandnigger","raghead",
  "cracker","honkey","peckerwood","coon","jigaboo","porch monkey",
  "dyke","lesbo","queer","troon"
);

export function containsProfanity(text: string): boolean {
  try {
    return filter.isProfane(text);
  } catch {
    return false;
  }
}

export function filterMessage(text: string): { ok: boolean; reason?: string } {
  if (containsProfanity(text)) return { ok: false, reason: "Message contains inappropriate content" };
  if (text.length > 2000) return { ok: false, reason: "Message too long (max 2000 chars)" };
  if (/<script|javascript:|on\w+=/i.test(text)) return { ok: false, reason: "Invalid content" };
  return { ok: true };
}

export function filterUsername(username: string): { ok: boolean; reason?: string } {
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return { ok: false, reason: "Username must be 3-20 chars, letters/numbers/underscore only" };
  }
  if (containsProfanity(username)) {
    return { ok: false, reason: "Username not allowed" };
  }
  return { ok: true };
}
