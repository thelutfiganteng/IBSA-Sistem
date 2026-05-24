import { store } from "./storage";
import type { User, AuditEntry } from "./types";

export function logAudit(user: User, action: string, detail?: string) {
  const entry: AuditEntry = {
    id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    user: user.name,
    role: user.role,
    action,
    detail,
  };
  store.audit.add(entry);
}
