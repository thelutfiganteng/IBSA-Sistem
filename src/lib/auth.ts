import { supabase } from "./supabase";
import type { Role } from "./types";
import { logAudit } from "./audit";

export async function logout() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      
      const name = profile?.full_name || session.user.email || 'Tanpa Nama';
      logAudit(
        { 
          id: session.user.id, 
          name, 
          role: (profile?.role as Role) || 'pasar', 
          email: session.user.email || '' 
        }, 
        "LOGOUT", 
        `User ${name} logout`
      );
    }
  } catch (err) {
    console.error("Error logging audit during logout:", err);
  }
  await supabase.auth.signOut();
}

// Role-based page access
export const ROLE_ACCESS: Record<Role, string[]> = {
  bi: ["dashboard", "clustering", "ai-analytics", "ai-center", "forecasting", "price-intelligence", "anomaly-detection", "gis-map", "distribusi", "laporan", "petugas"],
  bps: ["dashboard", "komoditas", "clustering", "ai-analytics", "ai-center", "forecasting", "price-intelligence", "anomaly-detection", "gis-map", "laporan"],
  pemprov: ["dashboard", "clustering", "ai-analytics", "ai-center", "forecasting", "price-intelligence", "anomaly-detection", "gis-map", "distribusi", "laporan", "petugas", "aktivitas-petugas"],
  dinas: ["dashboard", "komoditas", "timbangan", "ai-analytics", "ai-center", "forecasting", "price-intelligence", "anomaly-detection", "gis-map", "laporan", "petugas", "aktivitas-petugas"],
  pasar: ["timbangan"],
};

export function canAccess(role: Role, page: string): boolean {
  return ROLE_ACCESS[role]?.includes(page) ?? false;
}
