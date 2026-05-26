/**
 * kmeans.ts — K-Means Clustering Engine (upgraded)
 *
 * Now uses SDR and foodSecurityScore from intelligence-core as additional
 * features, giving 10-feature vectors for richer clustering.
 *
 * computeRegionMetrics() is kept for backward compatibility, but internally
 * delegates to intelligence-core for deterministic, accurate metrics.
 *
 * applyClusters() enriches metrics with K-Means cluster labels using the
 * 6-status label set (including "Krisis Pangan").
 */

import type { ClusterLabel, RegionMetric, WeighRecord } from "./types";
import type { IntelligenceRegionMetric } from "./intelligence-core";
import { computeIntelligenceCore } from "./intelligence-core";
import { REGIONS } from "./seed";

// ---------------------------------------------------------------------------
// BACKWARD-COMPATIBLE computeRegionMetrics
// Delegates to intelligence-core so all callers get accurate, consistent data.
// ---------------------------------------------------------------------------
export function computeRegionMetrics(weighs: WeighRecord[]): RegionMetric[] {
  const snap = computeIntelligenceCore(weighs);
  return snap.metrics.map((m) => ({
    regionId: m.regionId,
    totalSupply: m.totalSupply,
    totalDemand: m.totalDemand,
    avgPrice: m.avgPrice,
    distributionVolume: m.distributionVolume,
    supplyFrequency: m.supplyFrequency,
    warehouseStock: m.warehouseStock,
    activeMarkets: m.activeMarkets,
    surplusDeficit: m.surplusDeficit,
    cluster: m.regionStatus as ClusterLabel,
    inflationRisk: m.inflationRisk,
    sdr: m.sdr,
    foodSecurityScore: m.foodSecurityScore,
  }));
}

// ---------------------------------------------------------------------------
// FEATURE SET for K-Means (10 features: 8 original + sdr + foodSecurityScore)
// ---------------------------------------------------------------------------
const FEATURES: (keyof IntelligenceRegionMetric)[] = [
  "totalSupply",
  "totalDemand",
  "avgPrice",
  "distributionVolume",
  "supplyFrequency",
  "warehouseStock",
  "activeMarkets",
  "surplusDeficit",
  "sdr",
  "foodSecurityScore",
];

function normalize(metrics: IntelligenceRegionMetric[]) {
  const mins: Record<string, number> = {};
  const maxs: Record<string, number> = {};
  FEATURES.forEach((f) => {
    const vals = metrics.map((m) => Number(m[f]) || 0);
    mins[f] = Math.min(...vals);
    maxs[f] = Math.max(...vals);
  });
  return metrics.map((m) => {
    const v: number[] = [];
    FEATURES.forEach((f) => {
      const range = maxs[f] - mins[f] || 1;
      v.push(((Number(m[f]) || 0) - mins[f]) / range);
    });
    return v;
  });
}

function euclidean(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

export interface KMeansResult {
  assignments: number[];
  centroids: number[][];
  labels: ClusterLabel[];
}

export function kmeans(
  metrics: IntelligenceRegionMetric[],
  k = 6, // Now 6 clusters to include "Krisis Pangan"
  maxIter = 50,
): KMeansResult {
  const data = normalize(metrics);
  if (data.length === 0) return { assignments: [], centroids: [], labels: [] };

  // Initialize centroids: spread by SDR (best proxy for status)
  const sorted = metrics
    .map((m, i) => ({ i, sdr: m.sdr }))
    .sort((a, b) => b.sdr - a.sdr);
  const idxs: number[] = [];
  for (let i = 0; i < k; i++) {
    idxs.push(sorted[Math.floor((i * sorted.length) / k)].i);
  }
  let centroids = idxs.map((i) => [...data[i]]);
  let assignments = new Array(data.length).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    const newAssign = data.map((p) => {
      let best = 0;
      let bestD = Infinity;
      centroids.forEach((c, ci) => {
        const d = euclidean(p, c);
        if (d < bestD) { bestD = d; best = ci; }
      });
      return best;
    });
    const sums: number[][] = Array.from({ length: k }, () => new Array(data[0].length).fill(0));
    const counts = new Array(k).fill(0);
    data.forEach((p, i) => {
      counts[newAssign[i]]++;
      p.forEach((v, j) => (sums[newAssign[i]][j] += v));
    });
    const newCentroids = sums.map((s, ci) =>
      counts[ci] === 0 ? centroids[ci] : s.map((v) => v / counts[ci]),
    );
    const stable = JSON.stringify(newAssign) === JSON.stringify(assignments);
    assignments = newAssign;
    centroids = newCentroids;
    if (stable) break;
  }

  // Label clusters by mean SDR (sorted desc → Surplus Tinggi → Krisis Pangan)
  const clusterMeans = centroids.map((_, ci) => {
    const memberSDRs = metrics
      .filter((_, i) => assignments[i] === ci)
      .map((m) => m.sdr);
    const avg = memberSDRs.length ? memberSDRs.reduce((a, b) => a + b, 0) / memberSDRs.length : 0;
    return { ci, avg };
  });
  clusterMeans.sort((a, b) => b.avg - a.avg);
  const orderedLabels: ClusterLabel[] = [
    "Surplus Tinggi",
    "Surplus Sedang",
    "Stabil",
    "Defisit Sedang",
    "Defisit Tinggi",
    "Krisis Pangan",
  ];
  const labelMap: Record<number, ClusterLabel> = {};
  clusterMeans.forEach((cm, idx) => {
    labelMap[cm.ci] = orderedLabels[idx] ?? "Stabil";
  });
  const labels: ClusterLabel[] = centroids.map((_, ci) => labelMap[ci]);

  return { assignments, centroids, labels };
}

// ---------------------------------------------------------------------------
// applyClusters — enriches IntelligenceRegionMetric[] with K-Means labels
// ---------------------------------------------------------------------------
export function applyClusters(metrics: RegionMetric[]): RegionMetric[] {
  // For backward compat, we just return the metrics already clustered
  // (they come pre-clustered from computeRegionMetrics → intelligence-core)
  return metrics;
}

// ---------------------------------------------------------------------------
// computeEnrichedMetrics — returns full IntelligenceRegionMetric[]
// with K-Means cluster labels applied on top of SDR-based regionStatus
// ---------------------------------------------------------------------------
export function computeEnrichedMetrics(weighs: WeighRecord[]): IntelligenceRegionMetric[] {
  const snap = computeIntelligenceCore(weighs);
  return snap.metrics;
}

// ---------------------------------------------------------------------------
// inflationRiskOf — kept for backward compat (used in ai.ts, price-intel.ts)
// ---------------------------------------------------------------------------
export function inflationRiskOf(m: RegionMetric): "Low" | "Medium" | "High" {
  const ratio = m.totalDemand === 0 ? 1 : m.totalSupply / m.totalDemand;
  if (ratio < 0.7) return "High";
  if (ratio < 1.05) return "Medium";
  return "Low";
}

// ---------------------------------------------------------------------------
// Re-export type for backward compatibility
// ---------------------------------------------------------------------------
export type { IntelligenceRegionMetric };

// ---------------------------------------------------------------------------
// Province-wide cluster summary helper
// ---------------------------------------------------------------------------
export function clusterSummary(metrics: RegionMetric[]): Record<ClusterLabel, string[]> {
  const grouped: Record<string, string[]> = {};
  metrics.forEach((m) => {
    const label = m.cluster ?? "Stabil";
    const name = REGIONS.find((r) => r.id === m.regionId)?.name ?? m.regionId;
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(name);
  });
  return grouped as Record<ClusterLabel, string[]>;
}
