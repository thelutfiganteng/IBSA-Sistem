/**
 * useIntelligenceCore — Central React hook for the Core Brain Engine.
 *
 * Returns the full IntelligenceSnapshot with auto-refresh every 30 seconds.
 * Memoized and cached to localStorage with 60-second TTL.
 */

import { useMemo, useEffect, useRef, useState, useCallback } from "react";
import { store } from "./storage";
import { computeIntelligenceCore } from "./intelligence-core";
import type { IntelligenceSnapshot } from "./intelligence-core";

const CACHE_KEY = "sfs:intelligence_snapshot";
const CACHE_TTL_MS = 60_000; // 60 seconds
const AUTO_REFRESH_MS = 30_000; // 30 seconds

function isBrowser() {
  return typeof window !== "undefined";
}

function getCachedSnapshot(): IntelligenceSnapshot | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; snapshot: IntelligenceSnapshot };
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.snapshot;
  } catch {
    return null;
  }
}

function setCachedSnapshot(snapshot: IntelligenceSnapshot) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), snapshot }));
  } catch {}
}

export function computeSnapshot(): IntelligenceSnapshot {
  const weighs = store.weighs.get();
  const snapshot = computeIntelligenceCore(weighs);
  setCachedSnapshot(snapshot);
  return snapshot;
}

export function useIntelligenceCore(): {
  snapshot: IntelligenceSnapshot | null;
  loading: boolean;
  refresh: () => void;
  lastUpdated: Date | null;
} {
  const [snapshot, setSnapshot] = useState<IntelligenceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    // Use a microtask to avoid blocking the UI thread
    setTimeout(() => {
      const cached = getCachedSnapshot();
      const result = cached ?? computeSnapshot();
      setSnapshot(result);
      setLastUpdated(new Date(result.generatedAt));
      setLoading(false);
    }, 0);
  }, []);

  // Force fresh computation (ignores cache)
  const forceRefresh = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      const result = computeSnapshot();
      setSnapshot(result);
      setLastUpdated(new Date(result.generatedAt));
      setLoading(false);
    }, 0);
  }, []);

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(forceRefresh, AUTO_REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh, forceRefresh]);

  return { snapshot, loading, refresh: forceRefresh, lastUpdated };
}

/**
 * useIntelligenceMemo — Lightweight memoized version for components that
 * receive weighs directly (e.g., inside a parent that already has the data).
 */
export function useIntelligenceMemo(mounted: boolean, trigger?: any): IntelligenceSnapshot | null {
  return useMemo(() => {
    if (!mounted) return null;
    return computeIntelligenceCore(store.weighs.get());
  }, [mounted, trigger]);
}
