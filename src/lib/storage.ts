import type { AuditEntry, WeighRecord } from "./types";
import { COMMODITIES, MARKETS } from "./seed";
import { supabase, supabaseAdmin } from "./supabase";
import { seedSupabaseUsers } from "./seed-supabase";

const KEYS = {
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

// In-memory cache for synchronous reads in components
let cachedWeighs: WeighRecord[] = [];
let cachedAudit: AuditEntry[] = [];

// Convert DB snake_case to frontend camelCase
function mapDbToWeighRecord(dbRow: any): WeighRecord {
  return {
    id: dbRow.id,
    tanggal: dbRow.tanggal,
    komoditasId: dbRow.komoditas_id,
    berat: Number(dbRow.berat),
    harga: Number(dbRow.harga),
    pasarId: dbRow.pasar_id,
    petugas: dbRow.petugas,
    foto: dbRow.foto || "",
    lokasi: dbRow.lokasi,
    status_supply: dbRow.status_supply,
    aiLabel: dbRow.ai_label,
  };
}

export const store = {
  weighs: {
    get: () => {
      return cachedWeighs;
    },
    load: async () => {
      const { data, error } = await supabaseAdmin
        .from('weigh_records')
        .select('*')
        .order('tanggal', { ascending: false })
        .limit(1000);
      
      if (!error && data) {
        cachedWeighs = data.map(mapDbToWeighRecord);
      }
      return cachedWeighs;
    },
    set: (rows: WeighRecord[]) => {
      cachedWeighs = rows;
    },
    add: async (row: WeighRecord) => {
      cachedWeighs = [row, ...cachedWeighs];
      await supabaseAdmin.from('weigh_records').insert({
        id: row.id,
        tanggal: row.tanggal,
        komoditas_id: row.komoditasId,
        berat: row.berat,
        harga: row.harga,
        pasar_id: row.pasarId,
        petugas: row.petugas,
        foto: row.foto,
        lokasi: row.lokasi,
        status_supply: row.status_supply,
        ai_label: row.aiLabel
      });
    },
    update: async (id: string, patch: Partial<WeighRecord>) => {
      cachedWeighs = cachedWeighs.map((r) => (r.id === id ? { ...r, ...patch } : r));
      if (patch.status_supply) {
         await supabaseAdmin.from('weigh_records').update({ status_supply: patch.status_supply }).eq('id', id);
      }
    },
    remove: async (id: string) => {
      cachedWeighs = cachedWeighs.filter((r) => r.id !== id);
      await supabaseAdmin.from('weigh_records').delete().eq('id', id);
    },
  },
  audit: {
    get: () => cachedAudit,
    add: (entry: AuditEntry) => {
      cachedAudit = [entry, ...cachedAudit].slice(0, 500);
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

// Seed demo data directly to Supabase if empty
export async function ensureSeed() {
  if (!isBrowser()) return;

  // 1. Jalankan seeder akun demo ke Supabase
  await seedSupabaseUsers();
  
  if (store.seeded.get()) {
    await store.weighs.load();
    return;
  }
  
  // Try to load first
  const existing = await store.weighs.load();
  if (existing.length > 0) {
     store.seeded.set(true);
     return;
  }

  const rows: any[] = [];
  const now = Date.now();
  for (let i = 0; i < 60; i++) {
    const c = COMMODITIES[Math.floor(Math.random() * COMMODITIES.length)];
    const m = MARKETS[Math.floor(Math.random() * MARKETS.length)];
    const berat = Math.round(50 + Math.random() * 400);
    rows.push({
      tanggal: new Date(now - Math.random() * 14 * 86400000).toISOString(),
      komoditas_id: c.id,
      berat,
      harga: Math.round(c.basePrice * (0.9 + Math.random() * 0.3)),
      pasar_id: m.id,
      petugas: ["Joko", "Sari", "Andi", "Budi"][Math.floor(Math.random() * 4)],
      foto: "",
      lokasi: m.name,
      status_supply: "incoming",
      ai_label: c.name,
    });
  }
  
  const { data } = await supabaseAdmin.from('weigh_records').insert(rows).select();
  if (data) {
     cachedWeighs = data.map(mapDbToWeighRecord);
  }
  store.seeded.set(true);
}
