import { store } from "./storage";
import type { Role, User } from "./types";
import { DEMO_USERS } from "./seed";
import { logAudit } from "./audit";

export function login(email: string, password: string): User | null {
  const found = DEMO_USERS.find((u) => u.email === email && u.password === password);
  if (!found) return null;
  const user: User = { id: found.email, name: found.name, role: found.role, email: found.email };
  store.user.set(user);
  logAudit(user, "LOGIN", `User ${user.name} login sebagai ${user.role}`);
  return user;
}

export function logout() {
  const u = store.user.get();
  if (u) logAudit(u, "LOGOUT", `User ${u.name} logout`);
  store.user.set(null);
}

export function currentUser(): User | null {
  return store.user.get();
}

// Role-based page access
export const ROLE_ACCESS: Record<Role, string[]> = {
  bi: ["dashboard", "clustering", "ai-analytics", "ai-center", "forecasting", "price-intelligence", "anomaly-detection", "gis-map", "distribusi", "laporan"],
  bps: ["dashboard", "komoditas", "clustering", "ai-analytics", "ai-center", "forecasting", "price-intelligence", "anomaly-detection", "gis-map", "laporan"],
  pemprov: ["dashboard", "clustering", "ai-analytics", "ai-center", "forecasting", "price-intelligence", "anomaly-detection", "gis-map", "distribusi", "laporan"],
  dinas: ["dashboard", "komoditas", "timbangan", "ai-analytics", "ai-center", "forecasting", "price-intelligence", "anomaly-detection", "gis-map", "laporan"],
  pasar: ["dashboard", "timbangan", "komoditas", "price-intelligence", "ai-center"],
};

export function canAccess(role: Role, page: string): boolean {
  return ROLE_ACCESS[role]?.includes(page) ?? false;
}
