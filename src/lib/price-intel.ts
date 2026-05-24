import type { WeighRecord, ClusterLabel } from "./types";
import { COMMODITIES, MARKETS, REGIONS } from "./seed";
import { applyClusters, computeRegionMetrics } from "./kmeans";

// ============================================================
// Real-Time Price Intelligence + AI Anomaly Detection
// ============================================================

export type RiskLevel = "Low" | "Medium" | "High";

export interface PriceSnapshot {
  id: string;
  tanggal: string;
  pasarId: string;
  pasarName: string;
  wilayah: string;
  komoditasId: string;
  komoditasName: string;
  harga: number;
  hargaKemarin: number;
  perubahanPct: number;
  supply: number;
  volatilityScore: number; // 0..1
  anomalyStatus: "normal" | "abnormal";
  risk: RiskLevel;
}

export interface PriceSeriesPoint {
  date: string;
  price: number;
  ma: number; // moving average
}

export interface VolatilitySeries {
  komoditasId: string;
  komoditasName: string;
  pasarId: string;
  pasarName: string;
  points: PriceSeriesPoint[];
  volatility: number;
  spikes: { date: string; price: number; deltaPct: number }[];
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function stddev(values: number[]) {
  if (!values.length) return 0;
  const m = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

function movingAverage(arr: number[], window = 3) {
  return arr.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = arr.slice(start, i + 1);
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  });
}

// ---------- Build per-market per-commodity series ----------
export function buildPriceSeries(
  weighs: WeighRecord[],
  komoditasId: string,
  pasarId: string,
  days = 14,
): PriceSeriesPoint[] {
  const com = COMMODITIES.find((c) => c.id === komoditasId)!;
  const seed = hash(komoditasId + pasarId);
  const rnd = seededRandom(seed);
  const out: { date: string; price: number }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(now);
    dt.setDate(dt.getDate() - i);
    const key = dt.toDateString();
    const rows = weighs.filter(
      (w) =>
        w.komoditasId === komoditasId &&
        w.pasarId === pasarId &&
        new Date(w.tanggal).toDateString() === key,
    );
    const base = com.basePrice;
    const wave = Math.sin((i + seed) / 1.7) * 0.08;
    const noise = (rnd() - 0.5) * 0.06;
    // Inject deterministic spikes for some markets
    const spike = i === 2 && seed % 5 === 0 ? 0.18 : i === 6 && seed % 7 === 0 ? -0.12 : 0;
    const synthetic = base * (1 + wave + noise + spike);
    const price =
      rows.length > 0
        ? Math.round(rows.reduce((s, w) => s + w.harga, 0) / rows.length)
        : Math.round(synthetic);
    out.push({ date: dt.toISOString().slice(0, 10), price });
  }
  const ma = movingAverage(out.map((p) => p.price), 3);
  return out.map((p, i) => ({ ...p, ma: Math.round(ma[i]) }));
}

// ---------- Live snapshot per market x commodity ----------
export function buildSnapshots(weighs: WeighRecord[]): PriceSnapshot[] {
  const snaps: PriceSnapshot[] = [];
  MARKETS.forEach((m) => {
    COMMODITIES.forEach((c) => {
      const series = buildPriceSeries(weighs, c.id, m.id);
      const today = series[series.length - 1];
      const yest = series[series.length - 2] ?? today;
      const prices = series.map((p) => p.price);
      const vol = stddev(prices) / Math.max(today.price, 1);
      const change = ((today.price - yest.price) / Math.max(yest.price, 1)) * 100;
      const supplyRows = weighs.filter(
        (w) => w.komoditasId === c.id && w.pasarId === m.id,
      );
      const supply = supplyRows.reduce((s, w) => s + w.berat, 0) || Math.round(50 + hash(m.id + c.id) % 200);
      const abnormal = Math.abs(change) > 10 || vol > 0.09;
      let risk: RiskLevel = "Low";
      if (Math.abs(change) > 12 || vol > 0.1) risk = "High";
      else if (Math.abs(change) > 5 || vol > 0.06) risk = "Medium";
      snaps.push({
        id: `${m.id}-${c.id}`,
        tanggal: new Date().toISOString(),
        pasarId: m.id,
        pasarName: m.name,
        wilayah: m.region,
        komoditasId: c.id,
        komoditasName: c.name,
        harga: today.price,
        hargaKemarin: yest.price,
        perubahanPct: change,
        supply,
        volatilityScore: Math.min(1, vol * 5),
        anomalyStatus: abnormal ? "abnormal" : "normal",
        risk,
      });
    });
  });
  return snaps;
}

export function buildVolatilitySeries(weighs: WeighRecord[]): VolatilitySeries[] {
  const out: VolatilitySeries[] = [];
  MARKETS.forEach((m) => {
    COMMODITIES.forEach((c) => {
      const points = buildPriceSeries(weighs, c.id, m.id, 21);
      const prices = points.map((p) => p.price);
      const vol = stddev(prices) / Math.max(prices[prices.length - 1], 1);
      const spikes: VolatilitySeries["spikes"] = [];
      for (let i = 1; i < points.length; i++) {
        const delta = ((points[i].price - points[i - 1].price) / Math.max(points[i - 1].price, 1)) * 100;
        if (Math.abs(delta) > 10) {
          spikes.push({ date: points[i].date, price: points[i].price, deltaPct: delta });
        }
      }
      out.push({
        komoditasId: c.id,
        komoditasName: c.name,
        pasarId: m.id,
        pasarName: m.name,
        points,
        volatility: vol,
        spikes,
      });
    });
  });
  return out;
}

// ---------- Anomaly Detection ----------
export type AnomalyKind =
  | "harga-lonjakan"
  | "harga-manipulatif"
  | "supply-turun"
  | "timbangan-ekstrem"
  | "input-duplikat";

export interface Anomaly {
  id: string;
  pasarId: string;
  pasarName: string;
  komoditasId: string;
  komoditasName: string;
  jenis: AnomalyKind;
  severity: "low" | "medium" | "high";
  confidence: number; // 0..1
  timestamp: string;
  message: string;
  recommendation: string;
}

export function detectAnomalies(weighs: WeighRecord[]): Anomaly[] {
  const out: Anomaly[] = [];
  const snaps = buildSnapshots(weighs);
  const now = new Date().toISOString();

  // A. Harga lonjakan & manipulatif
  snaps.forEach((s) => {
    if (Math.abs(s.perubahanPct) > 15) {
      const sev: Anomaly["severity"] =
        Math.abs(s.perubahanPct) > 25 ? "high" : Math.abs(s.perubahanPct) > 18 ? "medium" : "low";
      out.push({
        id: `pa-${s.id}`,
        pasarId: s.pasarId,
        pasarName: s.pasarName,
        komoditasId: s.komoditasId,
        komoditasName: s.komoditasName,
        jenis: "harga-lonjakan",
        severity: sev,
        confidence: Math.min(0.98, 0.6 + Math.abs(s.perubahanPct) / 100),
        timestamp: now,
        message: `Terjadi anomali ${s.perubahanPct >= 0 ? "kenaikan" : "penurunan"} harga ${s.komoditasName} sebesar ${s.perubahanPct.toFixed(1)}% dalam 24 jam di ${s.pasarName}.`,
        recommendation:
          s.perubahanPct > 0
            ? `Operasi pasar / suplai tambahan ${s.komoditasName} ke ${s.pasarName}.`
            : `Verifikasi data harga & koordinasi distribusi.`,
      });
    }
  });

  // Manipulatif: harga >25% di atas rata-rata komoditas se-Sumsel
  COMMODITIES.forEach((c) => {
    const same = snaps.filter((s) => s.komoditasId === c.id);
    if (!same.length) return;
    const avg = same.reduce((sum, s) => sum + s.harga, 0) / same.length;
    same.forEach((s) => {
      const diff = ((s.harga - avg) / avg) * 100;
      if (diff > 25) {
        out.push({
          id: `mp-${s.id}`,
          pasarId: s.pasarId,
          pasarName: s.pasarName,
          komoditasId: s.komoditasId,
          komoditasName: s.komoditasName,
          jenis: "harga-manipulatif",
          severity: diff > 40 ? "high" : "medium",
          confidence: Math.min(0.95, 0.55 + diff / 100),
          timestamp: now,
          message: `Harga ${c.name} di ${s.pasarName} ${diff.toFixed(1)}% lebih tinggi dari rata-rata Sumsel — terindikasi manipulatif.`,
          recommendation: `Audit harga dan investigasi pedagang di ${s.pasarName}.`,
        });
      }
    });
  });

  // B. Supply turun drastis (bandingkan 7 hari awal vs 7 hari akhir)
  MARKETS.forEach((m) => {
    COMMODITIES.forEach((c) => {
      const rows = weighs.filter((w) => w.pasarId === m.id && w.komoditasId === c.id);
      const dt = (r: WeighRecord) => new Date(r.tanggal).getTime();
      const cutoff = Date.now() - 7 * 86400000;
      const early = rows.filter((r) => dt(r) < cutoff).reduce((s, r) => s + r.berat, 0);
      const late = rows.filter((r) => dt(r) >= cutoff).reduce((s, r) => s + r.berat, 0);
      if (early > 50) {
        const change = ((late - early) / early) * 100;
        if (change < -30) {
          out.push({
            id: `sd-${m.id}-${c.id}`,
            pasarId: m.id,
            pasarName: m.name,
            komoditasId: c.id,
            komoditasName: c.name,
            jenis: "supply-turun",
            severity: change < -50 ? "high" : "medium",
            confidence: Math.min(0.96, 0.6 + Math.abs(change) / 100),
            timestamp: now,
            message: `Supply ${c.name} di ${m.name} turun ${Math.abs(change).toFixed(0)}% dalam 7 hari terakhir.`,
            recommendation: `Distribusikan suplai dari pasar surplus terdekat ke ${m.name}.`,
          });
        }
      }
    });
  });

  // C. Timbangan ekstrem
  weighs.forEach((w) => {
    if (w.berat > 2000 || (w.berat < 5 && w.berat > 0)) {
      const com = COMMODITIES.find((c) => c.id === w.komoditasId);
      const mk = MARKETS.find((m) => m.id === w.pasarId);
      out.push({
        id: `tb-${w.id}`,
        pasarId: w.pasarId,
        pasarName: mk?.name ?? w.pasarId,
        komoditasId: w.komoditasId,
        komoditasName: com?.name ?? w.komoditasId,
        jenis: "timbangan-ekstrem",
        severity: w.berat > 3000 ? "high" : "medium",
        confidence: 0.9,
        timestamp: w.tanggal,
        message: `Input timbangan ${com?.name ?? "komoditas"} ${w.berat} kg di ${mk?.name ?? "pasar"} terindikasi tidak wajar.`,
        recommendation: `Verifikasi ulang input timbangan & petugas.`,
      });
    }
  });

  // D. Input duplikat (sama pasar, komoditas, berat, dalam 5 menit)
  const seen = new Map<string, WeighRecord>();
  weighs.forEach((w) => {
    const key = `${w.pasarId}-${w.komoditasId}-${w.berat}`;
    const prev = seen.get(key);
    if (prev) {
      const dt = Math.abs(new Date(w.tanggal).getTime() - new Date(prev.tanggal).getTime());
      if (dt < 5 * 60 * 1000) {
        const com = COMMODITIES.find((c) => c.id === w.komoditasId);
        const mk = MARKETS.find((m) => m.id === w.pasarId);
        out.push({
          id: `dup-${w.id}`,
          pasarId: w.pasarId,
          pasarName: mk?.name ?? w.pasarId,
          komoditasId: w.komoditasId,
          komoditasName: com?.name ?? w.komoditasId,
          jenis: "input-duplikat",
          severity: "low",
          confidence: 0.8,
          timestamp: w.tanggal,
          message: `Terdeteksi input timbangan duplikat untuk ${com?.name} di ${mk?.name}.`,
          recommendation: `Cek log petugas dan hapus duplikasi data.`,
        });
      }
    }
    seen.set(key, w);
  });

  return out.sort((a, b) => (b.confidence - a.confidence));
}

export interface AnomalySummary {
  total: number;
  high: number;
  medium: number;
  low: number;
  topMarket: { pasarId: string; pasarName: string; count: number } | null;
  topCommodity: { komoditasId: string; komoditasName: string; count: number } | null;
}

export function summarizeAnomalies(anomalies: Anomaly[]): AnomalySummary {
  const byMarket = new Map<string, { name: string; count: number }>();
  const byCom = new Map<string, { name: string; count: number }>();
  anomalies.forEach((a) => {
    byMarket.set(a.pasarId, {
      name: a.pasarName,
      count: (byMarket.get(a.pasarId)?.count ?? 0) + 1,
    });
    byCom.set(a.komoditasId, {
      name: a.komoditasName,
      count: (byCom.get(a.komoditasId)?.count ?? 0) + 1,
    });
  });
  const topM = [...byMarket.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  const topC = [...byCom.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  return {
    total: anomalies.length,
    high: anomalies.filter((a) => a.severity === "high").length,
    medium: anomalies.filter((a) => a.severity === "medium").length,
    low: anomalies.filter((a) => a.severity === "low").length,
    topMarket: topM ? { pasarId: topM[0], pasarName: topM[1].name, count: topM[1].count } : null,
    topCommodity: topC
      ? { komoditasId: topC[0], komoditasName: topC[1].name, count: topC[1].count }
      : null,
  };
}

// ---------- GIS data ----------
export interface GisRegionData {
  regionId: string;
  regionName: string;
  lat: number;
  lng: number;
  supply: number;
  demand: number;
  surplus: number;
  inflationScore: number; // 0..100
  cluster: ClusterLabel;
  weather: "cerah" | "hujan" | "badai";
  logistics: "lancar" | "padat" | "macet";
  topKomoditas: string;
  bmkgDesc?: string;
  bmkgTemp?: number;
  bmkgHum?: number;
}

export function buildGisData(weighs: WeighRecord[]): GisRegionData[] {
  const metrics = applyClusters(computeRegionMetrics(weighs));
  return REGIONS.map((r) => {
    const m = metrics.find((x) => x.regionId === r.id)!;
    const supply = m.totalSupply || Math.round((r.population / 1000) * (0.4 + (hash(r.id) % 80) / 100));
    const demand = m.totalDemand;
    const surplus = supply - demand;
    const h = hash(r.id);
    const weather: GisRegionData["weather"] = h % 5 === 0 ? "badai" : h % 3 === 0 ? "hujan" : "cerah";
    const logistics: GisRegionData["logistics"] =
      h % 7 === 0 ? "macet" : h % 4 === 0 ? "padat" : "lancar";
    
    // Aligns inflationScore mathematically with K-Means risk profile
    const baseInflation = m.inflationRisk === "High" ? 80 : m.inflationRisk === "Medium" ? 50 : 25;
    const weatherFactor = weather === "hujan" ? 5 : weather === "badai" ? 15 : 0;
    const logisticsFactor = logistics === "macet" ? 10 : logistics === "padat" ? 5 : 0;
    const inflationScore = Math.min(100, Math.max(0, baseInflation + weatherFactor + logisticsFactor + (h % 8)));

    const marketIds = MARKETS.filter((x) => x.region === r.id).map((x) => x.id);
    const rows = weighs.filter((w) => marketIds.includes(w.pasarId));
    // top commodity by supply in this region
    const byC = new Map<string, number>();
    rows.forEach((w) => byC.set(w.komoditasId, (byC.get(w.komoditasId) ?? 0) + w.berat));
    const topId = [...byC.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const topName = COMMODITIES.find((c) => c.id === topId)?.name ?? COMMODITIES[h % COMMODITIES.length].name;
    return {
      regionId: r.id,
      regionName: r.name,
      lat: r.lat,
      lng: r.lng,
      supply,
      demand,
      surplus,
      inflationScore: Math.round(inflationScore),
      cluster: m.cluster ?? "Stabil",
      weather,
      logistics,
      topKomoditas: topName,
    };
  });
}

export interface DistributionFlow {
  fromRegionId: string;
  toRegionId: string;
  fromName: string;
  toName: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  volume: number;
  komoditas: string;
}

export function buildDistributionFlows(gis: GisRegionData[]): DistributionFlow[] {
  const surplus = gis.filter((g) => g.cluster.startsWith("Surplus")).sort((a, b) => b.surplus - a.surplus);
  const deficit = gis.filter((g) => g.cluster.startsWith("Defisit")).sort((a, b) => a.surplus - b.surplus);
  const flows: DistributionFlow[] = [];
  const n = Math.min(surplus.length, deficit.length, 6);
  for (let i = 0; i < n; i++) {
    const s = surplus[i];
    const d = deficit[i];
    const vol = Math.min(s.surplus, -d.surplus);
    flows.push({
      fromRegionId: s.regionId,
      toRegionId: d.regionId,
      fromName: s.regionName,
      toName: d.regionName,
      fromLat: s.lat,
      fromLng: s.lng,
      toLat: d.lat,
      toLng: d.lng,
      volume: Math.round(vol * 0.5),
      komoditas: s.topKomoditas,
    });
  }
  return flows;
}
