import type { AuditEntry, User, WeighRecord } from "./types";
import { COMMODITIES, MARKETS } from "./seed";

const KEYS = {
  user: "sfs:user",
  weighs: "sfs:weighs",
  audit: "sfs:audit",
  theme: "sfs:theme",
  seeded: "sfs:seeded",
} as const;

const isBrowser = () => typeof window !== "undefined";

export function getLS<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function setLS<T>(key: string, value: T) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export const store = {
  user: {
    get: () => getLS<User | null>(KEYS.user, null),
    set: (u: User | null) => setLS(KEYS.user, u),
  },
  weighs: {
    get: () => getLS<WeighRecord[]>(KEYS.weighs, []),
    set: (rows: WeighRecord[]) => setLS(KEYS.weighs, rows),
    add: (row: WeighRecord) => {
      const all = getLS<WeighRecord[]>(KEYS.weighs, []);
      all.unshift(row);
      setLS(KEYS.weighs, all);
    },
    update: (id: string, patch: Partial<WeighRecord>) => {
      const all = getLS<WeighRecord[]>(KEYS.weighs, []);
      const next = all.map((r) => (r.id === id ? { ...r, ...patch } : r));
      setLS(KEYS.weighs, next);
    },
    remove: (id: string) => {
      setLS(
        KEYS.weighs,
        getLS<WeighRecord[]>(KEYS.weighs, []).filter((r) => r.id !== id),
      );
    },
  },
  audit: {
    get: () => getLS<AuditEntry[]>(KEYS.audit, []),
    add: (entry: AuditEntry) => {
      const all = getLS<AuditEntry[]>(KEYS.audit, []);
      all.unshift(entry);
      setLS(KEYS.audit, all.slice(0, 500));
    },
  },
  theme: {
    get: () => getLS<"light" | "dark">(KEYS.theme, "light"),
    set: (t: "light" | "dark") => setLS(KEYS.theme, t),
  },
  seeded: {
    get: () => getLS<boolean>(KEYS.seeded, false),
    set: (v: boolean) => setLS(KEYS.seeded, v),
  },
};

// Seed demo weigh data
export function ensureSeed() {
  if (!isBrowser()) return;
  if (store.seeded.get()) return;
  const rows: WeighRecord[] = [];
  const now = Date.now();
  for (let i = 0; i < 60; i++) {
    const c = COMMODITIES[Math.floor(Math.random() * COMMODITIES.length)];
    const m = MARKETS[Math.floor(Math.random() * MARKETS.length)];
    const berat = Math.round(50 + Math.random() * 400);
    rows.push({
      id: `seed-${i}`,
      tanggal: new Date(now - Math.random() * 14 * 86400000).toISOString(),
      komoditasId: c.id,
      berat,
      harga: Math.round(c.basePrice * (0.9 + Math.random() * 0.3)),
      pasarId: m.id,
      petugas: ["Joko", "Sari", "Andi", "Budi"][Math.floor(Math.random() * 4)],
      foto: "",
      lokasi: m.name,
      status_supply: "incoming",
      aiLabel: c.name,
    });
  }
  store.weighs.set(rows);
  store.seeded.set(true);
}
