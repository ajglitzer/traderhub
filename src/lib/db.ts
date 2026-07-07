/* eslint-disable @typescript-eslint/no-explicit-any */
export let db: any = null;
try {
  const m = require("@prisma/client");
  const PC = m.PrismaClient || m.default?.PrismaClient;
  if (PC) {
    const g = globalThis as any;
    db = g._pris ?? new PC({ log: ["error"] });
    if (process.env.NODE_ENV !== "production") g._pris = db;
  }
} catch { /* run: npx prisma generate */ }

export function ser(t: Record<string, unknown>) {
  const j = (v: unknown, d: unknown) => { try { return typeof v === "string" ? JSON.parse(v) : (v ?? d); } catch { return d; } };
  return {
    ...t,
    emotions: j(t.emotions, []),
    tags: j(t.tags, []),
    screenshots: j(t.screenshots, []),
    customFields: j(t.customFields, {}),
    entryTime: t.entryTime instanceof Date ? t.entryTime.toISOString() : t.entryTime,
    exitTime: t.exitTime instanceof Date ? (t.exitTime as Date).toISOString() : t.exitTime,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt,
  };
}
