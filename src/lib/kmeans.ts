import type { ClusterLabel, RegionMetric, WeighRecord } from "./types";
import { REGIONS, MARKETS } from "./seed";

const FEATURES: (keyof RegionMetric)[] = [
  "totalSupply",
  "totalDemand",
  "avgPrice",
  "distributionVolume",
  "supplyFrequency",
  "warehouseStock",
  "activeMarkets",
  "surplusDeficit",
];

export function computeRegionMetrics(weighs: WeighRecord[]): RegionMetric[] {
  return REGIONS.map((r) => {
    const marketsInRegion = MARKETS.filter((m) => m.region === r.id).map((m) => m.id);
    const regionRows = weighs.filter((w) => marketsInRegion.includes(w.pasarId));
    const totalSupply = regionRows.reduce((s, w) => s + w.berat, 0);
    // demand proxy from population
    const totalDemand = Math.round(r.population * 0.0008 + (Math.random() * 50));
    const avgPrice =
      regionRows.length > 0
        ? Math.round(regionRows.reduce((s, w) => s + w.harga, 0) / regionRows.length)
        : 0;
    const distributionVolume = Math.round(totalSupply * (0.4 + Math.random() * 0.3));
    const supplyFrequency = regionRows.length;
    const warehouseStock = Math.max(0, totalSupply - distributionVolume);
    const activeMarkets = marketsInRegion.length;
    const surplusDeficit = totalSupply - totalDemand;
    return {
      regionId: r.id,
      totalSupply,
      totalDemand,
      avgPrice,
      distributionVolume,
      supplyFrequency,
      warehouseStock,
      activeMarkets,
      surplusDeficit,
    };
  });
}

function normalize(metrics: RegionMetric[]) {
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

export function kmeans(metrics: RegionMetric[], k = 5, maxIter = 50): KMeansResult {
  const data = normalize(metrics);
  if (data.length === 0)
    return { assignments: [], centroids: [], labels: [] };
  // Initialize centroids: pick k spread points by sorting on surplus/deficit
  const sorted = metrics
    .map((m, i) => ({ i, sd: m.surplusDeficit }))
    .sort((a, b) => b.sd - a.sd);
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
        if (d < bestD) {
          bestD = d;
          best = ci;
        }
      });
      return best;
    });
    // recompute centroids
    const sums: number[][] = Array.from({ length: k }, () =>
      new Array(data[0].length).fill(0),
    );
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

  // Label clusters by mean surplusDeficit (sorted desc → Surplus Tinggi → Defisit Tinggi)
  const clusterMeans = centroids.map((_, ci) => {
    const memberSD = metrics
      .filter((_, i) => assignments[i] === ci)
      .map((m) => m.surplusDeficit);
    const mean = memberSD.length ? memberSD.reduce((a, b) => a + b, 0) / memberSD.length : 0;
    return { ci, mean };
  });
  clusterMeans.sort((a, b) => b.mean - a.mean);
  const orderedLabels: ClusterLabel[] = [
    "Surplus Tinggi",
    "Surplus Sedang",
    "Stabil",
    "Defisit Sedang",
    "Defisit Tinggi",
  ];
  const labelMap: Record<number, ClusterLabel> = {};
  clusterMeans.forEach((cm, idx) => {
    labelMap[cm.ci] = orderedLabels[idx] ?? "Stabil";
  });
  const labels: ClusterLabel[] = centroids.map((_, ci) => labelMap[ci]);

  return { assignments, centroids, labels };
}

export function applyClusters(metrics: RegionMetric[]): RegionMetric[] {
  const res = kmeans(metrics, 5);
  return metrics.map((m, i) => ({
    ...m,
    cluster: res.labels[res.assignments[i]],
    inflationRisk: inflationRiskOf(m),
  }));
}

export function inflationRiskOf(m: RegionMetric): "Low" | "Medium" | "High" {
  const ratio = m.totalDemand === 0 ? 1 : m.totalSupply / m.totalDemand;
  if (ratio < 0.7) return "High";
  if (ratio < 1.05) return "Medium";
  return "Low";
}
