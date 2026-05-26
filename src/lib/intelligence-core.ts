/**
 * =============================================================================
 * DYNAMIC SUPPLY-DEMAND INTELLIGENCE ENGINE
 * Smart Food Supply Monitoring & AI Distribution Intelligence System Sumsel
 *
 * CORE BRAIN ENGINE — Single Source of Truth for the entire system.
 *
 * Contains:
 * 1. Supply Demand Ratio (SDR) Engine
 * 2. Food Security Intelligence Score (6-variable weighted)
 * 3. Dynamic Threshold Engine (Ramadan, holidays, harvest, weather)
 * 4. AI Volatility Engine (moving average + stddev)
 * 5. Statistical Anomaly Detection (mean ± 2σ)
 * 6. Weight Validation Engine (per-commodity bounds)
 * 7. AI Redistribution Engine (priority-weighted)
 * 8. AI Inflation Impact Calculator
 * 9. K-Means-ready feature vector output
 * =============================================================================
 */

import type { WeighRecord, DistributionRecommendation, ClusterLabel } from "./types";
import { COMMODITIES, REGIONS, MARKETS } from "./seed";

// ---------------------------------------------------------------------------
// 1. TYPES
// ---------------------------------------------------------------------------

export type RegionStatus =
  | "Surplus Tinggi"
  | "Surplus Sedang"
  | "Stabil"
  | "Defisit Sedang"
  | "Defisit Tinggi"
  | "Krisis Pangan";

export type FoodSecurityStatus =
  | "Sangat Surplus"
  | "Surplus"
  | "Stabil"
  | "Defisit"
  | "Krisis";

export type InflationRisk = "Low" | "Medium" | "High";

export interface IntelligenceRegionMetric {
  // --- Identity ---
  regionId: string;
  regionName: string;
  population: number;
  populationWeight: number; // proportion 0-1 of total Sumsel population

  // --- Supply / Demand ---
  totalSupply: number;   // kg
  totalDemand: number;   // kg
  warehouseStock: number;
  distributionVolume: number;
  supplyFrequency: number;
  activeMarkets: number;

  // --- SDR Engine ---
  sdr: number;                          // Supply Demand Ratio = supply / demand
  surplusDeficit: number;               // supply - demand (kept for backward compat)
  regionStatus: RegionStatus;           // 6-level classification
  dynamicThresholdMultiplier: number;   // 1.0 baseline, adjusted by context

  // --- Food Security Score ---
  foodSecurityScore: number;            // 0-100 weighted score
  foodSecurityStatus: FoodSecurityStatus;

  // --- Price & Volatility ---
  avgPrice: number;
  priceHistory: number[];               // 14-day price series
  volatility: number;                   // coefficient of variation (%)
  movingAverage7d: number;             // 7-day MA of price

  // --- Anomaly Detection ---
  anomalyUpperBound: number;           // mean + 2σ
  anomalyLowerBound: number;           // mean - 2σ
  isAnomaly: boolean;
  anomalyScore: number;                // 0-100, how far from mean (zscore normalized)

  // --- Risk & Impact ---
  inflationRisk: InflationRisk;
  inflationImpactScore: number;        // 0-100
  redistributionPriority: number;      // 0-100

  // --- Cluster (populated after K-Means) ---
  cluster?: RegionStatus;
}

export interface ContextEvent {
  name: string;
  type: "ramadan" | "holiday" | "harvest" | "weather" | "market";
  active: boolean;
  icon: string;
  demandMultiplier: number;
  supplyMultiplier: number;
  thresholdAdjustment: number;     // SDR threshold shift (e.g. +0.05 = raise alert threshold)
  description: string;
}

export interface WeightValidationResult {
  isValid: boolean;
  severity: "ok" | "warning" | "critical";
  message: string;
  expectedMin: number;
  expectedMax: number;
  actual: number;
  komoditasName: string;
}

export interface EnhancedDistributionRecommendation extends DistributionRecommendation {
  fromRegionName: string;
  toRegionName: string;
  fromSDR: number;
  toSDR: number;
  inflationImpactPct: number;      // predicted % decrease in price volatility at destination
  etaDays: number;                 // estimated delivery days
  routeScore: number;              // 0-100 logistics efficiency score
  foodSecurityGain: number;        // Food Score points gained at destination
  populationBenefit: number;       // number of people positively impacted
  priorityScore: number;           // composite priority 0-100
}

export interface IntelligenceSnapshot {
  metrics: IntelligenceRegionMetric[];
  recommendations: EnhancedDistributionRecommendation[];
  activeEvents: ContextEvent[];
  globalFoodScore: number;          // population-weighted average 0-100
  globalSDR: number;                // aggregate ratio
  totalSurplusRegions: number;
  totalDeficitRegions: number;
  totalCrisisRegions: number;
  totalStableRegions: number;
  sumselStatus: RegionStatus;       // overall province status
  generatedAt: string;
  computeDurationMs: number;
}

// ---------------------------------------------------------------------------
// 2. CONSTANTS
// ---------------------------------------------------------------------------

/** SDR thresholds — adjusted by dynamicThresholdMultiplier */
const SDR_THRESHOLDS = {
  surplusTinggi: 1.20,
  surplusSedang: 1.05,
  stabil: 0.95,
  defisitSedang: 0.80,
  defisitTinggi: 0.60, // below this = Krisis Pangan
};

/** Weight validation bounds per commodity (kg) */
const WEIGHT_BOUNDS: Record<string, { min: number; max: number }> = {
  beras: { min: 100, max: 3000 },
  cabai: { min: 50, max: 500 },
  "bawang-merah": { min: 30, max: 700 },
  "bawang-putih": { min: 30, max: 700 },
};

/** Average daily consumption per capita per commodity (kg/person/day) */
const CONSUMPTION_PER_CAPITA: Record<string, number> = {
  beras: 0.00043,      // ~430g/hari × 30 days scaled
  cabai: 0.000025,
  "bawang-merah": 0.000018,
  "bawang-putih": 0.000012,
};

// Ramadan dates (estimated, for offline use)
const RAMADAN_PERIODS: Array<{ start: string; end: string }> = [
  { start: "2025-03-01", end: "2025-03-30" },
  { start: "2026-02-18", end: "2026-03-19" },
  { start: "2027-02-07", end: "2027-03-08" },
  { start: "2028-01-27", end: "2028-02-25" },
  { start: "2029-01-15", end: "2029-02-13" },
  { start: "2030-01-05", end: "2030-02-03" },
];

// National holidays (MM-DD format)
const NATIONAL_HOLIDAYS_MD: string[] = [
  "01-01", // New Year
  "08-17", // Independence Day — demand spike
  "12-25", // Christmas
  "12-31", // New Year's Eve
];

// Harvest seasons in Sumsel (month ranges, 1-indexed)
const HARVEST_MONTHS = [4, 5, 6, 10, 11]; // April-June, Oct-Nov

// ---------------------------------------------------------------------------
// 3. MATH HELPERS (pure, deterministic)
// ---------------------------------------------------------------------------

function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function movingAverage(arr: number[], window = 7): number[] {
  return arr.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = arr.slice(start, i + 1);
    return mean(slice);
  });
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Deterministic hash for stable simulation */
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ---------------------------------------------------------------------------
// 4. DYNAMIC THRESHOLD ENGINE
// ---------------------------------------------------------------------------

export function computeContextEvents(): ContextEvent[] {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10); // yyyy-mm-dd
  const monthDay = todayStr.slice(5); // MM-DD
  const month = now.getMonth() + 1;
  const events: ContextEvent[] = [];

  // --- Ramadan detection ---
  const isRamadan = RAMADAN_PERIODS.some((p) => todayStr >= p.start && todayStr <= p.end);
  events.push({
    name: "Ramadan",
    type: "ramadan",
    active: isRamadan,
    icon: "🌙",
    demandMultiplier: isRamadan ? 1.35 : 1.0,
    supplyMultiplier: isRamadan ? 0.95 : 1.0,
    thresholdAdjustment: isRamadan ? 0.08 : 0,
    description: isRamadan
      ? "Ramadan aktif — demand naik 35%, threshold kewaspadaan dinaikkan."
      : "Ramadan tidak aktif.",
  });

  // --- National holidays ---
  const isHoliday = NATIONAL_HOLIDAYS_MD.includes(monthDay);
  events.push({
    name: "Hari Besar Nasional",
    type: "holiday",
    active: isHoliday,
    icon: "🎉",
    demandMultiplier: isHoliday ? 1.20 : 1.0,
    supplyMultiplier: isHoliday ? 0.98 : 1.0,
    thresholdAdjustment: isHoliday ? 0.05 : 0,
    description: isHoliday
      ? `Hari besar nasional (${monthDay}) — demand pangan meningkat 20%.`
      : "Tidak ada hari besar nasional hari ini.",
  });

  // --- Harvest season ---
  const isHarvest = HARVEST_MONTHS.includes(month);
  events.push({
    name: "Musim Panen",
    type: "harvest",
    active: isHarvest,
    icon: "🌾",
    demandMultiplier: isHarvest ? 0.95 : 1.0,
    supplyMultiplier: isHarvest ? 1.30 : 1.0,
    thresholdAdjustment: isHarvest ? -0.05 : 0,
    description: isHarvest
      ? `Musim panen aktif (bulan ${month}) — supply meningkat 30%, threshold longgar.`
      : "Bukan musim panen utama.",
  });

  // --- Simulate weather per current week (stable per week) ---
  const weekNum = Math.floor(now.getTime() / (7 * 24 * 3600 * 1000));
  const weatherHash = hashCode(`weather-${weekNum}`);
  const isBadWeather = weatherHash % 5 === 0; // ~20% probability
  const isRainWeek = weatherHash % 3 === 0;   // ~33% probability
  events.push({
    name: isBadWeather ? "Cuaca Buruk" : isRainWeek ? "Hujan" : "Cuaca Cerah",
    type: "weather",
    active: isBadWeather || isRainWeek,
    icon: isBadWeather ? "⛈️" : isRainWeek ? "🌧️" : "☀️",
    demandMultiplier: isBadWeather ? 1.10 : 1.0,
    supplyMultiplier: isBadWeather ? 0.85 : isRainWeek ? 0.93 : 1.0,
    thresholdAdjustment: isBadWeather ? 0.07 : isRainWeek ? 0.03 : 0,
    description: isBadWeather
      ? "Cuaca buruk terdeteksi — logistik terganggu, supply diprediksi turun 15%."
      : isRainWeek
      ? "Musim hujan — distribusi sedikit terhambat, supply turun 7%."
      : "Cuaca cerah mendukung distribusi optimal.",
  });

  return events;
}

export function computeThresholdMultiplier(events: ContextEvent[]): number {
  let multiplier = 1.0;
  events.filter((e) => e.active).forEach((e) => {
    multiplier += e.thresholdAdjustment;
  });
  return clamp(multiplier, 0.85, 1.30);
}

// ---------------------------------------------------------------------------
// 5. SDR ENGINE
// ---------------------------------------------------------------------------

export function classifySDR(sdr: number, thresholdMultiplier = 1.0): RegionStatus {
  // Adjust thresholds by context multiplier
  const adj = (v: number) => v * thresholdMultiplier;
  if (sdr > adj(SDR_THRESHOLDS.surplusTinggi)) return "Surplus Tinggi";
  if (sdr > adj(SDR_THRESHOLDS.surplusSedang)) return "Surplus Sedang";
  if (sdr > adj(SDR_THRESHOLDS.stabil)) return "Stabil";
  if (sdr > adj(SDR_THRESHOLDS.defisitSedang)) return "Defisit Sedang";
  if (sdr > adj(SDR_THRESHOLDS.defisitTinggi)) return "Defisit Tinggi";
  return "Krisis Pangan";
}

// ---------------------------------------------------------------------------
// 6. DEMAND CALCULATION ENGINE
// ---------------------------------------------------------------------------

export function computeDemand(regionId: string): number {
  const region = REGIONS.find((r) => r.id === regionId);
  if (!region) return 0;
  // Sum daily demand across all tracked commodities to match seed weighing snapshots
  return Math.round(
    Object.values(CONSUMPTION_PER_CAPITA).reduce(
      (s, rate) => s + region.population * rate,
      0,
    ),
  );
}

// ---------------------------------------------------------------------------
// 7. SUPPLY CALCULATION ENGINE
// ---------------------------------------------------------------------------

export function computeSupply(regionId: string, weighs: WeighRecord[]): number {
  const marketIds = MARKETS.filter((m) => m.region === regionId).map((m) => m.id);
  return weighs.filter((w) => marketIds.includes(w.pasarId)).reduce((s, w) => s + w.berat, 0);
}

// ---------------------------------------------------------------------------
// 8. AI VOLATILITY ENGINE
// ---------------------------------------------------------------------------

export function computePriceHistory(
  regionId: string,
  weighs: WeighRecord[],
  days = 14,
): number[] {
  const marketIds = MARKETS.filter((m) => m.region === regionId).map((m) => m.id);
  const now = new Date();
  const history: number[] = [];
  const basePrice =
    COMMODITIES.reduce((s, c) => s + c.basePrice, 0) / COMMODITIES.length;

  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(now);
    dt.setDate(dt.getDate() - i);
    const key = dt.toDateString();
    const rows = weighs.filter(
      (w) =>
        marketIds.includes(w.pasarId) &&
        new Date(w.tanggal).toDateString() === key,
    );
    const avgP =
      rows.length > 0
        ? rows.reduce((s, w) => s + w.harga, 0) / rows.length
        : // Use deterministic fallback based on region and day to avoid random drift
          basePrice * (0.92 + 0.12 * Math.abs(Math.sin((i + hashCode(regionId)) / 3)));
    history.push(Math.round(avgP));
  }
  return history;
}

export interface VolatilityResult {
  priceHistory: number[];
  movingAverage7d: number;
  avgPrice: number;
  volatility: number; // coefficient of variation %
  anomalyUpperBound: number; // mean + 2σ
  anomalyLowerBound: number; // mean - 2σ
  isAnomaly: boolean;
  anomalyScore: number; // 0-100
}

export function computeVolatility(priceHistory: number[]): VolatilityResult {
  const avg = mean(priceHistory);
  const sd = stddev(priceHistory);
  const ma = movingAverage(priceHistory, 7);
  const ma7d = ma[ma.length - 1] ?? avg;
  const currentPrice = priceHistory[priceHistory.length - 1] ?? avg;
  const cv = avg > 0 ? (sd / avg) * 100 : 0;
  const upper = avg + 2 * sd;
  const lower = Math.max(0, avg - 2 * sd);
  const isAnomaly = currentPrice > upper || currentPrice < lower;
  const zScore = sd > 0 ? Math.abs((currentPrice - avg) / sd) : 0;
  const anomalyScore = clamp(Math.round(zScore * 30), 0, 100);

  return {
    priceHistory,
    movingAverage7d: Math.round(ma7d),
    avgPrice: Math.round(avg),
    volatility: Math.round(cv * 10) / 10,
    anomalyUpperBound: Math.round(upper),
    anomalyLowerBound: Math.round(lower),
    isAnomaly,
    anomalyScore,
  };
}

// ---------------------------------------------------------------------------
// 9. FOOD SECURITY INTELLIGENCE SCORE
// ---------------------------------------------------------------------------

/**
 * Weighted Food Security Score (0-100)
 * S = Supply Coverage  (35%)
 * D = Demand Fullness  (25%)
 * G = Gudang/Warehouse (15%)
 * H = Harga Stability  (10%)
 * R = Distribusi Rate  (10%)
 * V = Volatilitas Inv  (5%)
 */
export function computeFoodSecurityScore(params: {
  totalSupply: number;
  totalDemand: number;
  warehouseStock: number;
  avgPrice: number;
  distributionVolume: number;
  volatility: number; // coefficient of variation %
}): { score: number; status: FoodSecurityStatus } {
  const { totalSupply, totalDemand, warehouseStock, avgPrice, distributionVolume, volatility } =
    params;

  // S: Supply coverage — 100 if supply >= 1.2x demand, 0 if supply = 0
  const supplyRatio = totalDemand > 0 ? totalSupply / totalDemand : 0;
  const S = clamp((supplyRatio / 1.2) * 100, 0, 100);

  // D: Demand fullness — how much demand is being met
  const D = clamp((totalSupply / Math.max(totalDemand, 1)) * 100, 0, 100);

  // G: Warehouse/Gudang stock — normalized against 20% of supply as "good"
  const targetStock = totalSupply * 0.2;
  const G = targetStock > 0 ? clamp((warehouseStock / targetStock) * 100, 0, 100) : 50;

  // H: Price stability — perfect if at base price (no premium)
  const avgBase = COMMODITIES.reduce((s, c) => s + c.basePrice, 0) / COMMODITIES.length;
  const priceRatio = avgBase > 0 ? avgPrice / avgBase : 1;
  // Score 100 if price == base, 0 if price is 50%+ above base
  const H = clamp((2 - priceRatio) * 100, 0, 100);

  // R: Distribution rate — how much of supply is being distributed
  const R = totalSupply > 0 ? clamp((distributionVolume / totalSupply) * 100, 0, 100) : 0;

  // V: Volatility inverse — 100 if no volatility, 0 if volatility >= 30%
  const V = clamp(100 - volatility * 3.33, 0, 100);

  const score = Math.round(0.35 * S + 0.25 * D + 0.15 * G + 0.10 * H + 0.10 * R + 0.05 * V);

  let status: FoodSecurityStatus;
  if (score > 85) status = "Sangat Surplus";
  else if (score > 70) status = "Surplus";
  else if (score > 50) status = "Stabil";
  else if (score > 30) status = "Defisit";
  else status = "Krisis";

  return { score, status };
}

// ---------------------------------------------------------------------------
// 10. INFLATION RISK ENGINE
// ---------------------------------------------------------------------------

export function computeInflationRisk(sdr: number, volatility: number): InflationRisk {
  if (sdr < 0.75 || volatility > 20) return "High";
  if (sdr < 0.95 || volatility > 10) return "Medium";
  return "Low";
}

export function computeInflationImpactScore(sdr: number, population: number): number {
  // Higher score = more inflation impact expected
  const populationFactor = clamp(population / 1_700_000, 0.1, 1.0); // normalized to Palembang
  const sdrFactor = clamp((1 - sdr) * 2, 0, 1); // how far from equilibrium
  return Math.round(clamp((sdrFactor * 0.6 + populationFactor * 0.4) * 100, 0, 100));
}

export function computeRedistributionPriority(
  sdr: number,
  population: number,
  inflationRisk: InflationRisk,
  warehouseStock: number,
): number {
  const riskScore = inflationRisk === "High" ? 1 : inflationRisk === "Medium" ? 0.6 : 0.2;
  const deficitScore = clamp((1.0 - sdr) * 1.5, 0, 1);
  const popScore = clamp(population / 1_700_000, 0.1, 1.0);
  const stockScore = warehouseStock < 50 ? 1 : warehouseStock < 200 ? 0.5 : 0;
  return Math.round(
    clamp((deficitScore * 0.40 + riskScore * 0.30 + popScore * 0.20 + stockScore * 0.10) * 100, 0, 100),
  );
}

// ---------------------------------------------------------------------------
// 11. WEIGHT VALIDATION ENGINE
// ---------------------------------------------------------------------------

export function validateWeight(
  komoditasId: string,
  actualKg: number,
): WeightValidationResult {
  const com = COMMODITIES.find((c) => c.id === komoditasId);
  const bounds = WEIGHT_BOUNDS[komoditasId] ?? { min: 10, max: 5000 };
  const komName = com?.name ?? komoditasId;

  if (actualKg >= bounds.min && actualKg <= bounds.max) {
    return {
      isValid: true,
      severity: "ok",
      message: `Berat ${komName} normal (${actualKg} kg).`,
      expectedMin: bounds.min,
      expectedMax: bounds.max,
      actual: actualKg,
      komoditasName: komName,
    };
  }

  const pctOver =
    actualKg > bounds.max
      ? Math.round(((actualKg - bounds.max) / bounds.max) * 100)
      : Math.round(((bounds.min - actualKg) / bounds.min) * 100);

  const severity: WeightValidationResult["severity"] = pctOver > 50 ? "critical" : "warning";

  return {
    isValid: false,
    severity,
    message:
      actualKg > bounds.max
        ? `[${severity.toUpperCase()}] Berat ${komName} (${actualKg} kg) MELEBIHI batas maksimum ${bounds.max} kg — kemungkinan anomali atau kesalahan input (+${pctOver}%).`
        : `[${severity.toUpperCase()}] Berat ${komName} (${actualKg} kg) DI BAWAH batas minimum ${bounds.min} kg — pastikan data valid (-${pctOver}%).`,
    expectedMin: bounds.min,
    expectedMax: bounds.max,
    actual: actualKg,
    komoditasName: komName,
  };
}

// ---------------------------------------------------------------------------
// 12. AI REDISTRIBUTION ENGINE + INFLATION IMPACT CALCULATOR
// ---------------------------------------------------------------------------

function computeInflationImpactPct(
  fromMetric: IntelligenceRegionMetric,
  toMetric: IntelligenceRegionMetric,
  amountKg: number,
): number {
  // Estimate how much the additional supply reduces price volatility at destination
  const demandCoverage = (toMetric.totalSupply + amountKg) / Math.max(toMetric.totalDemand, 1);
  const currentVolatility = toMetric.volatility;
  // Each 10% improvement in supply coverage reduces volatility by ~2%
  const supplyImprovementPct = clamp(((demandCoverage - toMetric.sdr) / toMetric.sdr) * 100, 0, 50);
  const volatilityReduction = supplyImprovementPct * 0.28;
  // Convert to inflation impact: high volatility = high price, reduction = lower inflation
  const inflationReduction = (volatilityReduction / Math.max(currentVolatility, 1)) * 10;
  return Math.round(clamp(inflationReduction, 0.5, 18) * 10) / 10;
}

function computeETA(fromId: string, toId: string): number {
  const from = REGIONS.find((r) => r.id === fromId);
  const to = REGIONS.find((r) => r.id === toId);
  if (!from || !to) return 2;
  const distanceDeg = Math.sqrt((from.lat - to.lat) ** 2 + (from.lng - to.lng) ** 2);
  // Rough: 1 degree ≈ 111km, avg truck speed 60km/h, 8h driving day
  const distKm = distanceDeg * 111;
  return Math.max(1, Math.round(distKm / 480)); // days
}

export function generateEnhancedRecommendations(
  metrics: IntelligenceRegionMetric[],
): EnhancedDistributionRecommendation[] {
  const surplus = [...metrics]
    .filter((m) => m.sdr > 1.05) // surplus sources
    .sort((a, b) => b.sdr - a.sdr);

  const deficit = [...metrics]
    .filter((m) => m.sdr < 0.95) // deficit targets
    .sort((a, b) => b.redistributionPriority - a.redistributionPriority);

  const recs: EnhancedDistributionRecommendation[] = [];
  const n = Math.min(surplus.length, deficit.length, 8);

  for (let i = 0; i < n; i++) {
    const src = surplus[i];
    const dst = deficit[i];
    // Amount = 40% of surplus or 60% of deficit gap (whichever is smaller)
    const surplusAmount = (src.sdr - 1.0) * src.totalDemand;
    const deficitAmount = (1.0 - dst.sdr) * dst.totalDemand;
    const amount = Math.round(Math.min(surplusAmount * 0.4, deficitAmount * 0.6));
    if (amount < 30) continue;

    const com = COMMODITIES[i % COMMODITIES.length];
    const inflationImpact = computeInflationImpactPct(src, dst, amount);
    const eta = computeETA(src.regionId, dst.regionId);
    const foodScoreGain = Math.round(
      clamp(((amount / Math.max(dst.totalDemand, 1)) * 100) * 0.4, 1, 25),
    );

    const priorityScore = Math.round(
      clamp(
        dst.redistributionPriority * 0.5 +
          (inflationImpact / 18) * 30 +
          ((dst.population / 1_700_000) * 20),
        0,
        100,
      ),
    );

    recs.push({
      id: `rec-${i}-${src.regionId}-${dst.regionId}`,
      fromRegionId: src.regionId,
      toRegionId: dst.regionId,
      fromRegionName: src.regionName,
      toRegionName: dst.regionName,
      fromSDR: src.sdr,
      toSDR: dst.sdr,
      komoditasId: com.id,
      amountKg: amount,
      priority:
        priorityScore > 70 ? "high" : priorityScore > 40 ? "medium" : "low",
      reason: `Distribusikan ${amount.toLocaleString("id-ID")} kg ${com.name} dari ${src.regionName} ke ${dst.regionName}. SDR asal: ${src.sdr.toFixed(2)}, SDR tujuan: ${dst.sdr.toFixed(2)}.`,
      inflationImpactPct: inflationImpact,
      etaDays: eta,
      routeScore: clamp(100 - eta * 15 - Math.round(src.volatility), 10, 100),
      foodSecurityGain: foodScoreGain,
      populationBenefit: Math.round(dst.population * clamp(amount / Math.max(dst.totalDemand, 1), 0, 1)),
      priorityScore,
    });
  }

  // Sort by priority score descending
  return recs.sort((a, b) => b.priorityScore - a.priorityScore);
}

// ---------------------------------------------------------------------------
// K-MEANS ALGORITHM FOR CORE SINKRONISASI
// ---------------------------------------------------------------------------

const KMEANS_FEATURES: (keyof IntelligenceRegionMetric)[] = [
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

function normalizeKMeans(metrics: IntelligenceRegionMetric[]) {
  const mins: Record<string, number> = {};
  const maxs: Record<string, number> = {};
  KMEANS_FEATURES.forEach((f) => {
    const vals = metrics.map((m) => Number(m[f]) || 0);
    mins[f] = Math.min(...vals);
    maxs[f] = Math.max(...vals);
  });
  return metrics.map((m) => {
    const v: number[] = [];
    KMEANS_FEATURES.forEach((f) => {
      const range = maxs[f] - mins[f] || 1;
      v.push(((Number(m[f]) || 0) - mins[f]) / range);
    });
    return v;
  });
}

function euclideanDistance(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

interface KMeansCoreResult {
  assignments: number[];
  centroids: number[][];
  labels: ClusterLabel[];
}

function runKMeansCore(
  metrics: IntelligenceRegionMetric[],
  k = 6,
  maxIter = 50,
): KMeansCoreResult {
  const data = normalizeKMeans(metrics);
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
        const d = euclideanDistance(p, c);
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
// 13. MAIN COMPUTE FUNCTION — computeIntelligenceCore()
// ---------------------------------------------------------------------------

export function computeIntelligenceCore(weighs: WeighRecord[]): IntelligenceSnapshot {
  const t0 = performance.now();

  // 1. Compute context events and threshold multiplier
  const activeEvents = computeContextEvents();
  const thresholdMultiplier = computeThresholdMultiplier(activeEvents);

  // 2. Total population for normalization
  const totalPopulation = REGIONS.reduce((s, r) => s + r.population, 0);

  // 3. Compute per-region intelligence metrics
  const metrics: IntelligenceRegionMetric[] = REGIONS.map((region) => {
    // Supply & Demand
    const totalSupply = computeSupply(region.id, weighs);
    const totalDemand = computeDemand(region.id);

    // Price History & Volatility
    const priceHistory = computePriceHistory(region.id, weighs);
    const volResult = computeVolatility(priceHistory);

    // Distribution volume = between 35-65% of supply (deterministic per region)
    const distFrac = 0.40 + ((hashCode(region.id) % 25) / 100);
    const distributionVolume = Math.round(totalSupply * distFrac);
    const warehouseStock = Math.max(0, totalSupply - distributionVolume);
    const supplyFrequency = weighs.filter((w) =>
      MARKETS.filter((m) => m.region === region.id)
        .map((m) => m.id)
        .includes(w.pasarId),
    ).length;
    const activeMarkets = MARKETS.filter((m) => m.region === region.id).length;

    // SDR Calculation
    const sdr = totalDemand > 0 ? totalSupply / totalDemand : 0;
    const regionStatus = classifySDR(sdr, thresholdMultiplier);
    const surplusDeficit = totalSupply - totalDemand;

    // Food Security Score
    const { score: foodSecurityScore, status: foodSecurityStatus } = computeFoodSecurityScore({
      totalSupply,
      totalDemand,
      warehouseStock,
      avgPrice: volResult.avgPrice,
      distributionVolume,
      volatility: volResult.volatility,
    });

    // Risk assessments
    const inflationRisk = computeInflationRisk(sdr, volResult.volatility);
    const inflationImpactScore = computeInflationImpactScore(sdr, region.population);
    const redistributionPriority = computeRedistributionPriority(
      sdr,
      region.population,
      inflationRisk,
      warehouseStock,
    );

    return {
      regionId: region.id,
      regionName: region.name,
      population: region.population,
      populationWeight: region.population / totalPopulation,
      totalSupply,
      totalDemand,
      warehouseStock,
      distributionVolume,
      supplyFrequency,
      activeMarkets,
      sdr: Math.round(sdr * 1000) / 1000,
      surplusDeficit,
      regionStatus,
      dynamicThresholdMultiplier: thresholdMultiplier,
      foodSecurityScore,
      foodSecurityStatus,
      avgPrice: volResult.avgPrice,
      priceHistory,
      volatility: volResult.volatility,
      movingAverage7d: volResult.movingAverage7d,
      anomalyUpperBound: volResult.anomalyUpperBound,
      anomalyLowerBound: volResult.anomalyLowerBound,
      isAnomaly: volResult.isAnomaly,
      anomalyScore: volResult.anomalyScore,
      inflationRisk,
      inflationImpactScore,
    };
  });

  // 3. Post-process: Run K-Means clustering dynamically inside the core brain engine
  // to ensure 100% synchronization and alignment across all maps, pages and components.
  const kResult = runKMeansCore(metrics, 6);
  metrics.forEach((m, i) => {
    const clusterLabel = kResult.labels[kResult.assignments[i]] ?? m.regionStatus;
    m.cluster = clusterLabel;
    m.regionStatus = clusterLabel; // Overrides raw regionStatus with K-Means!
  });

  // 4. Generate recommendations
  const recommendations = generateEnhancedRecommendations(metrics);

  // 5. Global aggregates
  const globalFoodScore = Math.round(
    metrics.reduce((s, m) => s + m.foodSecurityScore * m.populationWeight, 0),
  );
  const totalSupplyAll = metrics.reduce((s, m) => s + m.totalSupply, 0);
  const totalDemandAll = metrics.reduce((s, m) => s + m.totalDemand, 0);
  const globalSDR = Math.round((totalSupplyAll / Math.max(totalDemandAll, 1)) * 1000) / 1000;
  const totalSurplusRegions = metrics.filter(
    (m) => m.regionStatus === "Surplus Tinggi" || m.regionStatus === "Surplus Sedang",
  ).length;
  const totalDeficitRegions = metrics.filter(
    (m) => m.regionStatus === "Defisit Sedang" || m.regionStatus === "Defisit Tinggi",
  ).length;
  const totalCrisisRegions = metrics.filter((m) => m.regionStatus === "Krisis Pangan").length;
  const totalStableRegions = metrics.filter((m) => m.regionStatus === "Stabil").length;
  const sumselStatus = classifySDR(globalSDR, thresholdMultiplier);

  return {
    metrics,
    recommendations,
    activeEvents,
    globalFoodScore,
    globalSDR,
    totalSurplusRegions,
    totalDeficitRegions,
    totalCrisisRegions,
    totalStableRegions,
    sumselStatus,
    generatedAt: new Date().toISOString(),
    computeDurationMs: Math.round(performance.now() - t0),
  };
}

// ---------------------------------------------------------------------------
// 14. COLOR & LABEL HELPERS (used by all UI components)
// ---------------------------------------------------------------------------

export function statusColor(status: RegionStatus): string {
  switch (status) {
    case "Surplus Tinggi":  return "#22c55e"; // green-500
    case "Surplus Sedang":  return "#86efac"; // green-300
    case "Stabil":          return "#facc15"; // yellow-400
    case "Defisit Sedang":  return "#f97316"; // orange-500
    case "Defisit Tinggi":  return "#ef4444"; // red-500
    case "Krisis Pangan":   return "#7f1d1d"; // red-900 / deep red
    default:                return "#6b7280"; // gray-500
  }
}

export function statusBgClass(status: RegionStatus): string {
  switch (status) {
    case "Surplus Tinggi":  return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
    case "Surplus Sedang":  return "bg-green-500/20 text-green-300 border-green-500/40";
    case "Stabil":          return "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";
    case "Defisit Sedang":  return "bg-orange-500/20 text-orange-300 border-orange-500/40";
    case "Defisit Tinggi":  return "bg-red-500/20 text-red-300 border-red-500/40";
    case "Krisis Pangan":   return "bg-red-900/40 text-red-200 border-red-700/60";
    default:                return "bg-gray-500/20 text-gray-300 border-gray-500/40";
  }
}

export function foodScoreColor(score: number): string {
  if (score > 85) return "#22c55e";
  if (score > 70) return "#86efac";
  if (score > 50) return "#facc15";
  if (score > 30) return "#f97316";
  return "#ef4444";
}

export function sdrLabel(sdr: number): string {
  if (sdr > 1.20) return "Surplus Tinggi";
  if (sdr > 1.05) return "Surplus Sedang";
  if (sdr > 0.95) return "Stabil";
  if (sdr > 0.80) return "Defisit Sedang";
  if (sdr > 0.60) return "Defisit Tinggi";
  return "Krisis Pangan";
}
