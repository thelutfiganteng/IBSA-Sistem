import type { RegionMetric, WeighRecord, DistributionRecommendation } from "./types";
import { COMMODITIES, REGIONS, MARKETS } from "./seed";
import { store } from "./storage";
import { generateForecasts } from "./forecast";
import { detectAnomalies, buildSnapshots, buildGisData } from "./price-intel";
import { computeContextEvents, computeThresholdMultiplier } from "./intelligence-core";

export interface AiInsight {
  type: "summary" | "alert" | "recommendation" | "prediction";
  title: string;
  message: string;
  severity: "info" | "warning" | "danger";
}

export function generateInsights(
  metrics: RegionMetric[],
  weighs: WeighRecord[],
): AiInsight[] {
  const insights: AiInsight[] = [];
  const regionName = (id: string) => REGIONS.find((r) => r.id === id)?.name ?? id;

  const totalSupply = metrics.reduce((s, m) => s + m.totalSupply, 0);
  const surplusRegions = metrics.filter((m) => m.surplusDeficit > 50);
  const deficitRegions = metrics.filter((m) => m.surplusDeficit < -50);
  insights.push({
    type: "summary",
    severity: "info",
    title: "Ringkasan Kondisi Pangan Sumsel",
    message: `Total pasokan terpantau ${totalSupply.toLocaleString("id-ID")} kg dari ${weighs.length} transaksi timbangan. Terdeteksi ${surplusRegions.length} daerah surplus dan ${deficitRegions.length} daerah defisit.`,
  });

  deficitRegions.slice(0, 3).forEach((m) => {
    const pct = Math.round(((m.totalDemand - m.totalSupply) / Math.max(m.totalDemand, 1)) * 100);
    insights.push({
      type: "alert",
      severity: pct > 30 ? "danger" : "warning",
      title: `Defisit di ${regionName(m.regionId)}`,
      message: `AI mendeteksi ${regionName(m.regionId)} mengalami defisit pasokan ~${pct}% dan berpotensi kenaikan harga ${Math.min(25, Math.round(pct * 0.4))}% dalam 7 hari.`,
    });
  });

  const byCom = COMMODITIES.map((c) => {
    const total = weighs.filter((w) => w.komoditasId === c.id).reduce((s, w) => s + w.berat, 0);
    return { c, total };
  }).sort((a, b) => a.total - b.total);
  if (byCom[0]) {
    insights.push({
      type: "alert",
      severity: "warning",
      title: `Komoditas Kritis: ${byCom[0].c.name}`,
      message: `${byCom[0].c.name} memiliki pasokan terendah (${byCom[0].total} kg). Pertimbangkan tambahan supply dari daerah surplus.`,
    });
  }

  const recs = generateRecommendations(metrics);
  recs.slice(0, 2).forEach((r) => {
    insights.push({
      type: "recommendation",
      severity: "info",
      title: "Rekomendasi Distribusi",
      message: r.reason,
    });
  });

  const highRisk = metrics.filter((m) => m.inflationRisk === "High");
  insights.push({
    type: "prediction",
    severity: highRisk.length > 0 ? "danger" : "info",
    title: "Prediksi Inflasi Pangan",
    message: highRisk.length > 0
      ? `${highRisk.length} daerah berisiko tinggi inflasi pangan: ${highRisk.map((m) => regionName(m.regionId)).join(", ")}.`
      : `Risiko inflasi pangan secara umum stabil di seluruh wilayah Sumsel.`,
  });

  return insights;
}

export function generateRecommendations(
  metrics: RegionMetric[],
): DistributionRecommendation[] {
  const surplus = [...metrics]
    .filter((m) => m.surplusDeficit > 0)
    .sort((a, b) => b.surplusDeficit - a.surplusDeficit);
  const deficit = [...metrics]
    .filter((m) => m.surplusDeficit < 0)
    .sort((a, b) => a.surplusDeficit - b.surplusDeficit);
  const recs: DistributionRecommendation[] = [];
  const n = Math.min(surplus.length, deficit.length, 6);
  for (let i = 0; i < n; i++) {
    const s = surplus[i];
    const d = deficit[i];
    const amount = Math.min(s.surplusDeficit, -d.surplusDeficit);
    if (amount < 20) continue;
    const c = COMMODITIES[i % COMMODITIES.length];
    const fromName = REGIONS.find((r) => r.id === s.regionId)?.name ?? s.regionId;
    const toName = REGIONS.find((r) => r.id === d.regionId)?.name ?? d.regionId;
    recs.push({
      id: `rec-${i}`,
      fromRegionId: s.regionId,
      toRegionId: d.regionId,
      komoditasId: c.id,
      amountKg: Math.round(amount * 0.5),
      priority: amount > 200 ? "high" : amount > 80 ? "medium" : "low",
      reason: `Distribusikan ${Math.round(amount * 0.5)} kg ${c.name} dari ${fromName} ke ${toName}.`,
    });
  }
  return recs;
}

// ============================================================
// Advanced AI Chatbot — Multi-intent NL command resolver
// Supports: harga, supply, surplus/defisit, clustering, anomaly,
// forecasting, distribusi, pasar, wilayah, petugas, audit, ringkasan.
// ============================================================

const fmtNum = (n: number) => n.toLocaleString("id-ID");
const fmtRp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

function findCommodity(msg: string) {
  return COMMODITIES.find((c) => msg.includes(c.name.toLowerCase().split(" ")[0]) || msg.includes(c.id));
}
function findRegion(msg: string) {
  return REGIONS.find((r) => {
    const t = r.name.toLowerCase().replace(/^(kota|kab\.?|kabupaten)\s+/i, "");
    return msg.includes(t) || msg.includes(r.id);
  });
}
function findMarket(msg: string) {
  return MARKETS.find((m) => msg.includes(m.name.toLowerCase().replace(/^pasar\s+(induk\s+)?/, "")) || msg.includes(m.id));
}

export function chatbotReply(message: string, metrics: RegionMetric[], weighs: WeighRecord[]): string {
  const m = message.toLowerCase().trim();
  if (!m) return "Silakan ketik pertanyaan Anda.";

  // ---- Greetings & help ----
  if (/^(hai|halo|hi|hello|pagi|siang|sore|malam)\b/.test(m)) {
    return "Halo! Saya AI Asisten Pangan Sumsel 🌾. Saya bisa menjawab tentang:\n• Harga & supply komoditas per pasar/wilayah\n• Daerah surplus / defisit / cluster\n• Anomali harga & supply\n• Prediksi inflasi & forecasting 7-30 hari\n• Rekomendasi distribusi\n• Audit log & aktivitas petugas\n• Cuaca & logistik daerah\nContoh: \"harga cabai di palembang\", \"forecast beras 30 hari\", \"daftar anomali tinggi\".";
  }
  if (/(help|bantuan|bisa apa|fitur|menu)/.test(m)) {
    return "Perintah yang saya pahami:\n1️⃣ harga <komoditas> [di <pasar/wilayah>]\n2️⃣ supply <komoditas> [di <wilayah>]\n3️⃣ daerah surplus / defisit / stabil\n4️⃣ cluster <wilayah>\n5️⃣ anomali / anomaly [tinggi|sedang|rendah]\n6️⃣ forecast / prediksi <komoditas> [di <wilayah>]\n7️⃣ inflasi [wilayah]\n8️⃣ rekomendasi distribusi\n9️⃣ daftar pasar / wilayah / komoditas / petugas\n🔟 ringkasan / total / status / audit";
  }

  const com = findCommodity(m);
  const reg = findRegion(m);
  const mk = findMarket(m);

  // ---- LIST queries ----
  if (/(daftar|list|semua)\s+(pasar|market)/.test(m)) {
    return `Pasar induk Sumsel (${MARKETS.length}):\n${MARKETS.map((x) => `• ${x.name} — ${REGIONS.find((r) => r.id === x.region)?.name}`).join("\n")}`;
  }
  if (/(daftar|list|semua)\s+(wilayah|daerah|kabupaten|kota)/.test(m)) {
    return `Wilayah pantauan (${REGIONS.length}):\n${REGIONS.map((r) => `• ${r.name}`).join("\n")}`;
  }
  if (/(daftar|list|semua)\s+(komoditas|komoditi|barang)/.test(m)) {
    return `Komoditas dipantau:\n${COMMODITIES.map((c) => `${c.icon} ${c.name} — harga acuan ${fmtRp(c.basePrice)}/${c.unit}`).join("\n")}`;
  }
  if (/(daftar|list)\s+(petugas|operator)/.test(m)) {
    const set = new Map<string, number>();
    weighs.forEach((w) => set.set(w.petugas, (set.get(w.petugas) ?? 0) + 1));
    const list = [...set.entries()].sort((a, b) => b[1] - a[1]);
    return `Petugas timbangan aktif:\n${list.map(([n, c]) => `• ${n} — ${c} transaksi`).join("\n") || "(belum ada data)"}`;
  }

  // ---- AUDIT / ACTIVITY ----
  if (/(audit|aktivitas|log|riwayat)/.test(m)) {
    const a = store.audit.get().slice(0, 5);
    if (!a.length) return "Belum ada audit log tercatat.";
    return `5 aktivitas terakhir:\n${a.map((x) => `• [${new Date(x.timestamp).toLocaleTimeString("id-ID")}] ${x.user} — ${x.action}`).join("\n")}`;
  }

  // ---- ANOMALY ----
  if (/(anomali|anomaly|kecurangan|manipulat|lonjakan)/.test(m)) {
    const all = detectAnomalies(weighs);
    let f = all;
    if (/tinggi|high|kritis/.test(m)) f = all.filter((a) => a.severity === "high");
    else if (/sedang|medium/.test(m)) f = all.filter((a) => a.severity === "medium");
    else if (/rendah|low/.test(m)) f = all.filter((a) => a.severity === "low");
    if (mk) f = f.filter((a) => a.pasarId === mk.id);
    if (com) f = f.filter((a) => a.komoditasId === com.id);
    if (!f.length) return "Tidak ada anomali terdeteksi untuk kriteria tersebut. Sistem stabil ✅";
    return `Ditemukan ${f.length} anomali (top 5):\n${f.slice(0, 5).map((a) => `⚠ [${a.severity.toUpperCase()}] ${a.komoditasName} @ ${a.pasarName} — ${a.message}`).join("\n")}`;
  }

  // ---- FORECAST / PREDIKSI ----
  if (/(forecast|prediksi|ramal|trend)/.test(m)) {
    const bundle = generateForecasts(weighs, metrics);
    let rows = bundle.rows;
    if (com) rows = rows.filter((r) => r.komoditasId === com.id);
    if (reg) rows = rows.filter((r) => r.regionId === reg.id);
    if (!rows.length) return "Belum ada prediksi untuk kombinasi tersebut.";
    if (com && reg) {
      const r = rows[0];
      return `📈 Prediksi ${r.komoditasName} di ${r.regionName}:\n• Harga kini: ${fmtRp(r.currentPrice)}\n• Prediksi 7 hari: ${fmtRp(r.predictedPrice)} (${r.inflationPct >= 0 ? "+" : ""}${r.inflationPct.toFixed(1)}%)\n• Prediksi 30 hari: ${fmtRp(r.predictedPrice30)} (${r.inflationPct30 >= 0 ? "+" : ""}${r.inflationPct30.toFixed(1)}%)\n• Tren: ${r.trend} • Risiko: ${r.risk} • Confidence: ${(r.confidence * 100).toFixed(0)}%\n💡 ${r.aiInsight}`;
    }
    const top = rows.sort((a, b) => b.inflationPct - a.inflationPct).slice(0, 5);
    return `Top 5 prediksi inflasi tertinggi:\n${top.map((r) => `• ${r.komoditasName} @ ${r.regionName}: ${r.inflationPct >= 0 ? "+" : ""}${r.inflationPct.toFixed(1)}% [${r.risk}]`).join("\n")}`;
  }

  // ---- INFLATION ----
  if (/(inflasi|kenaikan harga)/.test(m)) {
    const high = metrics.filter((x) => x.inflationRisk === "High");
    const med = metrics.filter((x) => x.inflationRisk === "Medium");
    if (reg) {
      const rm = metrics.find((x) => x.regionId === reg.id);
      return rm
        ? `Risiko inflasi ${reg.name}: ${rm.inflationRisk}. Supply ${fmtNum(rm.totalSupply)}kg vs demand ${fmtNum(rm.totalDemand)}kg.`
        : `Data tidak ditemukan untuk ${reg.name}.`;
    }
    return `Status inflasi Sumsel:\n🔴 High: ${high.length} wilayah (${high.map((x) => REGIONS.find((r) => r.id === x.regionId)?.name).slice(0, 5).join(", ") || "-"})\n🟡 Medium: ${med.length} wilayah\n🟢 Low: ${metrics.length - high.length - med.length} wilayah`;
  }

  // ---- FOOD SECURITY SCORE / SKOR PANGAN ----
  if (/(food security|food score|skor pangan|skor keamanan pangan)/.test(m)) {
    if (reg) {
      const rm = metrics.find((x) => x.regionId === reg.id);
      return rm && rm.foodSecurityScore !== undefined
        ? `🌾 Skor Keamanan Pangan ${reg.name} adalah **${rm.foodSecurityScore}/100** (Status: **${rm.cluster}**).`
        : `Data tidak ditemukan untuk ${reg.name}.`;
    }
    const ranked = [...metrics]
      .filter((x) => x.foodSecurityScore !== undefined)
      .sort((a, b) => (b.foodSecurityScore ?? 0) - (a.foodSecurityScore ?? 0));
    
    const sumselScore = Math.round(
      metrics.reduce((s, x) => s + (x.foodSecurityScore ?? 50) * (REGIONS.find((r) => r.id === x.regionId)?.population ?? 1), 0) /
      REGIONS.reduce((s, r) => s + r.population, 0)
    );

    return `🌾 Keamanan Pangan Sumsel (Rata-rata tertimbang): **${sumselScore}/100**.\n\nLeaderboard Ketahanan Wilayah:\n${ranked
      .slice(0, 5)
      .map((x, idx) => `${idx + 1}. ${REGIONS.find((r) => r.id === x.regionId)?.name}: **${x.foodSecurityScore}/100**`)
      .join("\n")}`;
  }

  // ---- SUPPLY DEMAND RATIO / SDR ----
  if (/(sdr|supply demand ratio|rasio suplai)/.test(m)) {
    if (reg) {
      const rm = metrics.find((x) => x.regionId === reg.id);
      const ratio = rm ? (rm.sdr ?? (rm.totalDemand > 0 ? rm.totalSupply / rm.totalDemand : 1.0)) : 1.0;
      return rm
        ? `📊 Supply Demand Ratio (SDR) ${reg.name}: **${ratio.toFixed(3)}** (Status: **${rm.cluster}**). Pasokan masuk: ${fmtNum(rm.totalSupply)} kg, Kebutuhan harian: ${fmtNum(Math.round(rm.totalDemand / 30))} kg.`
        : `Data tidak ditemukan untuk ${reg.name}.`;
    }
    const totalS = metrics.reduce((s, x) => s + x.totalSupply, 0);
    const totalD = metrics.reduce((s, x) => s + x.totalDemand, 0);
    const globalRatio = totalD > 0 ? totalS / totalD : 0;
    return `📊 Supply Demand Ratio (SDR) Sumsel secara agregat: **${globalRatio.toFixed(3)}** (${totalS > totalD ? "Surplus" : "Defisit"}).\nTotal Supply: ${fmtNum(totalS)} kg\nTotal Demand: ${fmtNum(totalD)} kg.`;
  }

  // ---- KRISIS PANGAN / KRISIS ----
  if (/(krisis pangan|krisis|danger|crisis)/.test(m)) {
    const crisis = metrics.filter((x) => {
      const ratio = x.sdr ?? (x.totalDemand > 0 ? x.totalSupply / x.totalDemand : 1.0);
      return ratio < 0.60 || x.cluster === "Krisis Pangan";
    });
    if (!crisis.length) return "Alhamdulillah! Tidak ada wilayah Sumsel dalam status Krisis Pangan (SDR < 0.60) saat ini. Sistem terpantau aman dan terkendali. ✅";
    return `🚨 PERINGATAN KRISIS PANGAN!\nDitemukan ${crisis.length} wilayah dengan risiko krisis pangan ekstrem (SDR < 0.60):\n${crisis.map((x) => {
      const ratio = x.sdr ?? (x.totalDemand > 0 ? x.totalSupply / x.totalDemand : 0);
      return `• ${REGIONS.find((r) => r.id === x.regionId)?.name}: SDR **${ratio.toFixed(3)}** — Butuh bantuan logistik pangan darurat segera!`;
    }).join("\n")}`;
  }

  // ---- EVENT AKTIF / RAMADAN / KONTEKS ----
  if (/(event aktif|ramadan|lebaran|hari besar|konteks|multiplier)/.test(m)) {
    const evs = computeContextEvents();
    const active = evs.filter((e: any) => e.active);
    const mult = computeThresholdMultiplier(evs);
    if (!active.length) return "Tidak ada event pasar aktif (seperti Ramadan atau cuaca buruk) hari ini. Multiplier threshold: **1.00** (Kondisi normal).";
    return `🔔 Event Pasar Aktif saat ini:\n${active.map((e: any) => `${e.icon} **${e.name}**: ${e.description}`).join("\n")}\n\nMultiplier Threshold: **×${mult.toFixed(2)}**`;
  }

  // ---- CLUSTER ----
  if (/(cluster|klaster|pengelompokan)/.test(m)) {
    if (reg) {
      const rm = metrics.find((x) => x.regionId === reg.id);
      return rm ? `${reg.name} masuk cluster: ${rm.cluster}. Surplus/Defisit: ${rm.surplusDeficit >= 0 ? "+" : ""}${fmtNum(rm.surplusDeficit)} kg.` : "Wilayah tidak ditemukan.";
    }
    const grouped = new Map<string, string[]>();
    metrics.forEach((mx) => {
      const k = mx.cluster ?? "Stabil";
      const n = REGIONS.find((r) => r.id === mx.regionId)?.name ?? mx.regionId;
      grouped.set(k, [...(grouped.get(k) ?? []), n]);
    });
    return `Hasil clustering K-Means:\n${[...grouped.entries()].map(([k, v]) => `• ${k} (${v.length}): ${v.join(", ")}`).join("\n")}`;
  }

  // ---- SURPLUS / DEFISIT / STABIL ----
  if (/(surplus)/.test(m)) {
    const list = metrics.filter((x) => x.surplusDeficit > 0).sort((a, b) => b.surplusDeficit - a.surplusDeficit);
    return `${list.length} daerah surplus. Top 5:\n${list.slice(0, 5).map((x) => `🟢 ${REGIONS.find((r) => r.id === x.regionId)?.name}: +${fmtNum(x.surplusDeficit)} kg`).join("\n")}`;
  }
  if (/(defisit|kurang|kekurangan)/.test(m)) {
    const list = metrics.filter((x) => x.surplusDeficit < 0).sort((a, b) => a.surplusDeficit - b.surplusDeficit);
    return `${list.length} daerah defisit. Prioritas distribusi:\n${list.slice(0, 5).map((x) => `🔴 ${REGIONS.find((r) => r.id === x.regionId)?.name}: ${fmtNum(x.surplusDeficit)} kg`).join("\n")}`;
  }
  if (/(stabil|aman|normal)/.test(m) && !/cluster/.test(m)) {
    const list = metrics.filter((x) => Math.abs(x.surplusDeficit) <= 50);
    return `${list.length} daerah dalam kondisi stabil: ${list.map((x) => REGIONS.find((r) => r.id === x.regionId)?.name).join(", ") || "-"}.`;
  }

  // ---- REKOMENDASI / DISTRIBUSI ----
  if (/(rekomendasi|distribu|kirim|alokasi)/.test(m)) {
    const r = generateRecommendations(metrics);
    if (!r.length) return "Tidak ada rekomendasi distribusi prioritas saat ini.";
    return `Rekomendasi distribusi AI (${r.length}):\n${r.slice(0, 5).map((x) => `🚚 [${x.priority.toUpperCase()}] ${x.reason}`).join("\n")}`;
  }

  // ---- CUACA / LOGISTIK ----
  if (/(cuaca|hujan|badai|logistik|transportasi)/.test(m)) {
    const gis = buildGisData(weighs);
    let g = gis;
    if (reg) g = g.filter((x) => x.regionId === reg.id);
    return g.slice(0, 8).map((x) => `📍 ${x.regionName}: cuaca ${x.weather}, logistik ${x.logistics}, inflasi-score ${x.inflationScore}/100`).join("\n");
  }

  // ---- HARGA ----
  if (/(harga|price)/.test(m)) {
    const snaps = buildSnapshots(weighs);
    let s = snaps;
    if (com) s = s.filter((x) => x.komoditasId === com.id);
    if (mk) s = s.filter((x) => x.pasarId === mk.id);
    if (reg) s = s.filter((x) => x.wilayah === reg.id);
    if (!s.length) return "Data harga tidak ditemukan untuk kriteria tersebut.";
    if (com && (mk || reg)) {
      const r = s[0];
      return `💰 ${r.komoditasName} @ ${r.pasarName}: ${fmtRp(r.harga)}/kg (${r.perubahanPct >= 0 ? "+" : ""}${r.perubahanPct.toFixed(1)}% dari kemarin). Status: ${r.anomalyStatus}, risiko ${r.risk}.`;
    }
    if (com) {
      const avg = s.reduce((sum, x) => sum + x.harga, 0) / s.length;
      const min = s.reduce((a, b) => (a.harga < b.harga ? a : b));
      const max = s.reduce((a, b) => (a.harga > b.harga ? a : b));
      return `${com.name} se-Sumsel:\n• Rata-rata: ${fmtRp(avg)}/kg\n• Terendah: ${fmtRp(min.harga)} @ ${min.pasarName}\n• Tertinggi: ${fmtRp(max.harga)} @ ${max.pasarName}`;
    }
    const byC = COMMODITIES.map((c) => {
      const ss = snaps.filter((x) => x.komoditasId === c.id);
      const avg = ss.reduce((sum, x) => sum + x.harga, 0) / Math.max(ss.length, 1);
      return `${c.icon} ${c.name}: ${fmtRp(avg)}/kg`;
    });
    return `Harga rata-rata pangan Sumsel hari ini:\n${byC.join("\n")}`;
  }

  // ---- SUPPLY ----
  if (/(supply|pasokan|stok|stock|berat|kg)/.test(m)) {
    if (com && reg) {
      const mids = MARKETS.filter((mm) => mm.region === reg.id).map((mm) => mm.id);
      const t = weighs.filter((w) => w.komoditasId === com.id && mids.includes(w.pasarId)).reduce((s, w) => s + w.berat, 0);
      return `Supply ${com.name} di ${reg.name}: ${fmtNum(t)} kg.`;
    }
    if (com) {
      const t = weighs.filter((w) => w.komoditasId === com.id).reduce((s, w) => s + w.berat, 0);
      return `Total pasokan ${com.name}: ${fmtNum(t)} kg dari seluruh pasar induk Sumsel.`;
    }
    if (reg) {
      const rm = metrics.find((x) => x.regionId === reg.id);
      return rm ? `Supply ${reg.name}: ${fmtNum(rm.totalSupply)} kg, demand ${fmtNum(rm.totalDemand)} kg, ${rm.surplusDeficit >= 0 ? "surplus" : "defisit"} ${fmtNum(Math.abs(rm.surplusDeficit))} kg.` : "Wilayah tidak ditemukan.";
    }
    const total = weighs.reduce((s, w) => s + w.berat, 0);
    return `Total pasokan pangan Sumsel: ${fmtNum(total)} kg dari ${weighs.length} transaksi timbangan.`;
  }

  // ---- INFO WILAYAH / PASAR ----
  if (reg) {
    const rm = metrics.find((x) => x.regionId === reg.id);
    if (rm) {
      return `📍 ${reg.name}\n• Cluster: ${rm.cluster}\n• Supply: ${fmtNum(rm.totalSupply)} kg | Demand: ${fmtNum(rm.totalDemand)} kg\n• ${rm.surplusDeficit >= 0 ? "Surplus" : "Defisit"}: ${fmtNum(Math.abs(rm.surplusDeficit))} kg\n• Risiko inflasi: ${rm.inflationRisk}\n• Pasar aktif: ${rm.activeMarkets} | Frek. supply: ${rm.supplyFrequency}`;
    }
  }
  if (mk) {
    const rows = weighs.filter((w) => w.pasarId === mk.id);
    const t = rows.reduce((s, w) => s + w.berat, 0);
    return `🏪 ${mk.name}\n• Transaksi: ${rows.length}\n• Total pasokan: ${fmtNum(t)} kg\n• Wilayah: ${REGIONS.find((r) => r.id === mk.region)?.name}`;
  }
  if (com) {
    const t = weighs.filter((w) => w.komoditasId === com.id).reduce((s, w) => s + w.berat, 0);
    return `${com.icon} ${com.name}\n• Harga acuan: ${fmtRp(com.basePrice)}/${com.unit}\n• Total pasokan: ${fmtNum(t)} kg`;
  }

  // ---- RINGKASAN / TOTAL / STATUS ----
  if (/(ringkas|summary|total|status|kondisi|overview)/.test(m)) {
    const total = weighs.reduce((s, w) => s + w.berat, 0);
    const surplus = metrics.filter((x) => x.surplusDeficit > 0).length;
    const deficit = metrics.filter((x) => x.surplusDeficit < 0).length;
    const high = metrics.filter((x) => x.inflationRisk === "High").length;
    return `📊 RINGKASAN PANGAN SUMSEL\n• Total pasokan: ${fmtNum(total)} kg (${weighs.length} transaksi)\n• Wilayah surplus: ${surplus} | defisit: ${deficit}\n• Risiko inflasi tinggi: ${high} wilayah\n• Pasar induk aktif: ${MARKETS.length}\n• Komoditas dipantau: ${COMMODITIES.length}`;
  }

  return "Maaf, saya belum memahami pertanyaan tersebut. Ketik **bantuan** untuk melihat semua perintah yang saya kuasai, atau coba: \"harga cabai\", \"forecast beras palembang\", \"daftar anomali\", \"daerah defisit\", \"rekomendasi distribusi\".";
}
