import type { RegionMetric, WeighRecord } from "./types";
import { COMMODITIES, REGIONS, MARKETS } from "./seed";

// ============================================================
// AI Trend & Inflation Forecasting Engine
// Moving Average + Linear Regression + Heuristic Risk Model
// ============================================================

export type TrendDirection = "naik" | "turun" | "tidak-stabil" | "stabil";
export type RiskLevel = "Low" | "Medium" | "High";

export interface PricePoint {
  date: string; // yyyy-mm-dd
  price: number;
  supply: number;
}

export interface ExternalFactors {
  weather: "cerah" | "hujan" | "badai";
  holiday: boolean;
  logistics: "lancar" | "padat" | "macet";
  disruption: boolean;
}

export interface CommodityForecast {
  komoditasId: string;
  komoditasName: string;
  regionId: string;
  regionName: string;
  history: PricePoint[];
  forecast: PricePoint[]; // 7-30 days
  currentPrice: number;
  predictedPrice: number; // 7d ahead
  predictedPrice30: number;
  inflationPct: number; // %
  inflationPct30: number;
  supplyChangePct: number;
  trend: TrendDirection;
  risk: RiskLevel;
  confidence: number; // 0-1
  aiInsight: string;
  external: ExternalFactors;
  createdAt: string;
}

// ---------- Math helpers ----------
function movingAverage(arr: number[], window = 3): number[] {
  return arr.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = arr.slice(start, i + 1);
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  });
}

function linearRegression(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 };
  const xs = values.map((_, i) => i);
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (values[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: meanY - slope * meanX };
}

function stddev(values: number[]) {
  if (values.length === 0) return 0;
  const m = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

// ---------- External factor simulation (deterministic per seed) ----------
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function externalFor(regionId: string, komoditasId: string): ExternalFactors {
  const h = hashCode(regionId + komoditasId);
  const weather: ExternalFactors["weather"] =
    h % 3 === 0 ? "hujan" : h % 5 === 0 ? "badai" : "cerah";
  const logistics: ExternalFactors["logistics"] =
    h % 7 === 0 ? "macet" : h % 4 === 0 ? "padat" : "lancar";
  return {
    weather,
    holiday: h % 11 === 0,
    logistics,
    disruption: h % 13 === 0,
  };
}

function externalMultiplier(ext: ExternalFactors): number {
  let m = 1;
  if (ext.weather === "hujan") m *= 1.02;
  if (ext.weather === "badai") m *= 1.06;
  if (ext.holiday) m *= 1.05;
  if (ext.logistics === "padat") m *= 1.02;
  if (ext.logistics === "macet") m *= 1.07;
  if (ext.disruption) m *= 1.08;
  return m;
}

// ---------- Build history from weighs ----------
function buildHistory(
  weighs: WeighRecord[],
  komoditasId: string,
  regionId: string,
  days = 14,
): PricePoint[] {
  const marketIds = MARKETS.filter((m) => m.region === regionId).map((m) => m.id);
  const base = COMMODITIES.find((c) => c.id === komoditasId)?.basePrice ?? 20000;
  const out: PricePoint[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(now);
    dt.setDate(dt.getDate() - i);
    const key = dt.toDateString();
    const rows = weighs.filter(
      (w) =>
        w.komoditasId === komoditasId &&
        marketIds.includes(w.pasarId) &&
        new Date(w.tanggal).toDateString() === key,
    );
    const supply = rows.reduce((s, w) => s + w.berat, 0);
    const avgP =
      rows.length > 0
        ? rows.reduce((s, w) => s + w.harga, 0) / rows.length
        : base * (0.95 + 0.1 * Math.sin((i + hashCode(regionId + komoditasId)) / 2));
    out.push({
      date: dt.toISOString().slice(0, 10),
      price: Math.round(avgP),
      supply: Math.round(supply || base * 0.005 * (0.5 + Math.random())),
    });
  }
  return out;
}

// ---------- Forecast single series ----------
export function forecastCommodity(
  weighs: WeighRecord[],
  komoditasId: string,
  regionId: string,
  horizon = 30,
): CommodityForecast {
  const com = COMMODITIES.find((c) => c.id === komoditasId)!;
  const reg = REGIONS.find((r) => r.id === regionId)!;
  const history = buildHistory(weighs, komoditasId, regionId);
  const prices = history.map((h) => h.price);
  const supplies = history.map((h) => h.supply);
  const ma = movingAverage(prices, 3);
  const { slope, intercept } = linearRegression(ma);
  const ext = externalFor(regionId, komoditasId);
  const extM = externalMultiplier(ext);

  const lastIdx = ma.length - 1;
  const currentPrice = prices[lastIdx];
  const forecast: PricePoint[] = [];
  const now = new Date();
  for (let i = 1; i <= horizon; i++) {
    const dt = new Date(now);
    dt.setDate(dt.getDate() + i);
    const trendVal = intercept + slope * (lastIdx + i);
    const noise = (Math.sin(i * 1.3 + hashCode(regionId)) * 0.01 + 1) * extM;
    const predictedPrice = Math.round(trendVal * noise);
    const supplyTrend = movingAverage(supplies, 3)[lastIdx] || supplies[lastIdx] || 0;
    const supplyDecay = Math.max(0, supplyTrend * (1 - i * 0.005 * (ext.disruption ? 2 : 1)));
    forecast.push({
      date: dt.toISOString().slice(0, 10),
      price: predictedPrice,
      supply: Math.round(supplyDecay),
    });
  }

  const predictedPrice = forecast[6]?.price ?? currentPrice;
  const predictedPrice30 = forecast[forecast.length - 1]?.price ?? currentPrice;
  const inflationPct = ((predictedPrice - currentPrice) / Math.max(currentPrice, 1)) * 100;
  const inflationPct30 = ((predictedPrice30 - currentPrice) / Math.max(currentPrice, 1)) * 100;

  const supplyEarly = supplies.slice(0, Math.ceil(supplies.length / 2)).reduce((s, v) => s + v, 0);
  const supplyLate = supplies.slice(Math.ceil(supplies.length / 2)).reduce((s, v) => s + v, 0);
  const supplyChangePct =
    supplyEarly === 0 ? 0 : ((supplyLate - supplyEarly) / supplyEarly) * 100;

  const volatility = stddev(prices) / Math.max(currentPrice, 1);
  let trend: TrendDirection = "stabil";
  if (volatility > 0.08) trend = "tidak-stabil";
  else if (slope > currentPrice * 0.003) trend = "naik";
  else if (slope < -currentPrice * 0.003) trend = "turun";

  let risk: RiskLevel = "Low";
  if (inflationPct > 8 || supplyChangePct < -15) risk = "High";
  else if (inflationPct > 3 || supplyChangePct < -5) risk = "Medium";

  const confidence = Math.max(0.55, Math.min(0.97, 1 - volatility * 2));

  const aiInsight = buildInsight({
    com: com.name,
    region: reg.name,
    inflationPct,
    supplyChangePct,
    trend,
    risk,
    ext,
  });

  return {
    komoditasId,
    komoditasName: com.name,
    regionId,
    regionName: reg.name,
    history,
    forecast,
    currentPrice,
    predictedPrice,
    predictedPrice30,
    inflationPct,
    inflationPct30,
    supplyChangePct,
    trend,
    risk,
    confidence,
    aiInsight,
    external: ext,
    createdAt: new Date().toISOString(),
  };
}

function buildInsight(p: {
  com: string;
  region: string;
  inflationPct: number;
  supplyChangePct: number;
  trend: TrendDirection;
  risk: RiskLevel;
  ext: ExternalFactors;
}): string {
  const inflTxt = `${p.inflationPct >= 0 ? "+" : ""}${p.inflationPct.toFixed(1)}%`;
  const supTxt = `${p.supplyChangePct >= 0 ? "+" : ""}${p.supplyChangePct.toFixed(1)}%`;
  if (p.risk === "High") {
    return `AI mendeteksi potensi inflasi ${p.com} di ${p.region} (${inflTxt}) dalam 7 hari ke depan akibat perubahan supply ${supTxt}${p.ext.disruption ? " dan gangguan distribusi" : ""}. Disarankan operasi pasar segera.`;
  }
  if (p.risk === "Medium") {
    return `Harga ${p.com} di ${p.region} cenderung ${p.trend} (${inflTxt}). Supply ${supTxt}. Pantau distribusi dari daerah surplus terdekat.`;
  }
  return `Kondisi ${p.com} di ${p.region} stabil. Prediksi inflasi ${inflTxt} dengan supply ${supTxt}. Tidak ada tindakan mendesak.`;
}

// ---------- Bulk forecast across regions x commodities ----------
export interface ForecastBundle {
  rows: CommodityForecast[];
  alerts: CommodityForecast[];
  generatedAt: string;
}

const TARGET_COMMODITIES = ["beras", "cabai", "bawang-merah", "bawang-putih"];

export function generateForecasts(
  weighs: WeighRecord[],
  _metrics: RegionMetric[],
): ForecastBundle {
  const rows: CommodityForecast[] = [];
  REGIONS.forEach((r) => {
    TARGET_COMMODITIES.forEach((cid) => {
      rows.push(forecastCommodity(weighs, cid, r.id));
    });
  });
  const alerts = rows.filter((r) => r.risk === "High").sort((a, b) => b.inflationPct - a.inflationPct);
  return { rows, alerts, generatedAt: new Date().toISOString() };
}

export const TARGETED_COMMODITY_IDS = TARGET_COMMODITIES;
