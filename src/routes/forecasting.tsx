import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMounted } from "@/hooks/use-mounted";
import { store } from "@/lib/storage";
import { applyClusters, computeRegionMetrics } from "@/lib/kmeans";
import { useIntelligenceMemo } from "@/lib/intelligence-store";
import {
  generateForecasts,
  type CommodityForecast,
  type RiskLevel,
} from "@/lib/forecast";
import { COMMODITIES, REGIONS } from "@/lib/seed";
import {
  Activity,
  AlertTriangle,
  Brain,
  CloudRain,
  Flame,
  Gauge,
  Radio,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Truck,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

export const Route = createFileRoute("/forecasting")({ component: ForecastingPage });

function ForecastingPage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

const RISK_BG: Record<RiskLevel, string> = {
  Low: "bg-supply/15 text-supply border-supply/30",
  Medium: "bg-warning/15 text-warning border-warning/30",
  High: "bg-deficit/15 text-deficit border-deficit/30",
};
const RISK_DOT: Record<RiskLevel, string> = {
  Low: "bg-supply",
  Medium: "bg-warning",
  High: "bg-deficit",
};

function Inner() {
  const mounted = useMounted();
  const [komoditas, setKomoditas] = useState<string>("cabai");
  const snapshot = useIntelligenceMemo(mounted);

  const data = useMemo(() => {
    if (!mounted) return null;
    const w = store.weighs.get();
    const m = applyClusters(computeRegionMetrics(w));
    return { bundle: generateForecasts(w, m), metrics: m };
  }, [mounted]);

  if (!data) return <div className="text-muted-foreground">Memuat engine AI…</div>;

  const activeEvents = snapshot?.activeEvents.filter((e) => e.active) ?? [];
  const thresholdMultiplier = snapshot?.metrics[0]?.dynamicThresholdMultiplier ?? 1.0;

  const filtered = data.bundle.rows.filter((r) => r.komoditasId === komoditas);
  const topRisk = [...data.bundle.rows].sort((a, b) => b.inflationPct - a.inflationPct).slice(0, 8);

  // aggregate trend: average price & supply per day across regions for selected komoditas
  const horizonLen = filtered[0]?.forecast.length ?? 0;
  const histLen = filtered[0]?.history.length ?? 0;
  const trendSeries = Array.from({ length: histLen + horizonLen }, (_, i) => {
    const isHist = i < histLen;
    const pricePoints = filtered.map((r) =>
      isHist ? r.history[i] : r.forecast[i - histLen],
    );
    const avgPrice =
      pricePoints.reduce((s, p) => s + (p?.price ?? 0), 0) / Math.max(pricePoints.length, 1);
    const avgSupply =
      pricePoints.reduce((s, p) => s + (p?.supply ?? 0), 0) / Math.max(pricePoints.length, 1);
    return {
      date: pricePoints[0]?.date ?? "",
      hist: isHist ? Math.round(avgPrice) : null,
      forecast: isHist ? null : Math.round(avgPrice),
      supply: Math.round(avgSupply),
    };
  });

  const highCount = data.bundle.rows.filter((r) => r.risk === "High").length;
  const medCount = data.bundle.rows.filter((r) => r.risk === "Medium").length;
  const lowCount = data.bundle.rows.filter((r) => r.risk === "Low").length;
  const avgConfidence =
    data.bundle.rows.reduce((s, r) => s + r.confidence, 0) / Math.max(data.bundle.rows.length, 1);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="overflow-hidden border-0 bg-gradient-to-br from-analytics/15 via-primary/10 to-background">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-analytics">
                <Brain className="h-4 w-4" />
                AI Engine · Live
                <span className="relative ml-1 flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-analytics opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-analytics" />
                </span>
              </div>
              <h2 className="text-2xl font-bold">AI Trend & Inflation Forecasting</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Mendeteksi tren harga pangan, memprediksi inflasi daerah 7–30 hari ke depan, dan
                memberikan early warning bagi BI, BPS, dan Pemprov Sumsel.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <MiniStat icon={AlertTriangle} label="High Risk" value={highCount} tone="deficit" />
              <MiniStat icon={Activity} label="Medium" value={medCount} tone="warning" />
              <MiniStat icon={TrendingUp} label="Low Risk" value={lowCount} tone="supply" />
              <MiniStat
                icon={Gauge}
                label="AI Confidence"
                value={`${Math.round(avgConfidence * 100)}%`}
                tone="analytics"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Context Events Banner */}
      {snapshot && activeEvents.length > 0 && (
        <Card className="border border-primary/30 bg-primary/5 shadow-sm overflow-hidden">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/20 text-primary">
                <Sparkles className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <h4 className="text-sm font-bold">Konteks Pasar Aktif (AI Dynamic Threshold)</h4>
                <p className="text-xs text-muted-foreground">
                  AI mendeteksi event aktif yang memengaruhi elastisitas demand pangan & threshold peringatan.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {activeEvents.map((e) => (
                <Badge key={e.name} variant="outline" className="bg-background/80 px-2.5 py-1 text-xs font-semibold gap-1.5 border-primary/25 text-primary">
                  <span>{e.icon}</span>
                  <span>{e.name}</span>
                </Badge>
              ))}
              <Badge className="bg-primary/95 text-white text-xs font-extrabold px-2.5 py-1 shadow border border-primary/30">
                Multiplier Threshold: ×{thresholdMultiplier.toFixed(2)}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Early Warning */}
      {data.bundle.alerts.length > 0 && (
        <Card className="border-deficit/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-deficit">
              <Radio className="h-5 w-5 animate-pulse" /> Early Warning System
              <Badge className="ml-auto bg-deficit text-white">
                {data.bundle.alerts.length} Alert Aktif
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {data.bundle.alerts.slice(0, 6).map((a) => (
              <div
                key={a.regionId + a.komoditasId}
                className="relative overflow-hidden rounded-lg border border-deficit/40 bg-deficit/5 p-4"
              >
                <div className="absolute right-3 top-3">
                  <Flame className="h-4 w-4 animate-pulse text-deficit" />
                </div>
                <div className="text-xs font-bold uppercase tracking-wider text-deficit">
                  ⚠ WARNING
                </div>
                <div className="mt-1 font-semibold">
                  {a.komoditasName} · {a.regionName}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{a.aiInsight}</p>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <Badge className="bg-deficit text-white">
                    +{a.inflationPct.toFixed(1)}% 7d
                  </Badge>
                  <Badge variant="outline">Confidence {Math.round(a.confidence * 100)}%</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Komoditas selector */}
      <div className="flex flex-wrap gap-2">
        {COMMODITIES.map((c) => (
          <Button
            key={c.id}
            variant={komoditas === c.id ? "default" : "outline"}
            size="sm"
            onClick={() => setKomoditas(c.id)}
            className="gap-2"
          >
            <span>{c.icon}</span> {c.name}
          </Button>
        ))}
      </div>

      {/* Trend chart */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-analytics" /> Prediksi Harga 30 Hari (Rata-rata Sumsel)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendSeries}>
                <defs>
                  <linearGradient id="histG" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--analytics)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="var(--analytics)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="hist"
                  stroke="var(--analytics)"
                  strokeWidth={2}
                  dot={false}
                  name="Historis"
                />
                <Line
                  type="monotone"
                  dataKey="forecast"
                  stroke="var(--warning)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  name="Prediksi AI"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-supply" /> Supply–Demand Forecast
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={trendSeries}>
                <defs>
                  <linearGradient id="supG" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--supply)" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="var(--supply)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="supply"
                  stroke="var(--supply)"
                  fill="url(#supG)"
                  name="Supply (kg)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-warning" /> Heatmap Inflasi per Wilayah & Komoditas
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-separate border-spacing-1 text-xs">
            <thead>
              <tr>
                <th className="text-left p-2">Wilayah</th>
                {COMMODITIES.map((c) => (
                  <th key={c.id} className="p-2">
                    {c.icon} {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {REGIONS.map((r) => (
                <tr key={r.id}>
                  <td className="p-2 font-medium">{r.name}</td>
                  {COMMODITIES.map((c) => {
                    const f = data.bundle.rows.find(
                      (x) => x.regionId === r.id && x.komoditasId === c.id,
                    );
                    if (!f) return <td key={c.id} className="p-2" />;
                    const pct = f.inflationPct;
                    const intensity = Math.min(1, Math.abs(pct) / 15);
                    const color =
                      f.risk === "High"
                        ? `rgba(239, 68, 68, ${0.25 + intensity * 0.65})`
                        : f.risk === "Medium"
                          ? `rgba(245, 158, 11, ${0.2 + intensity * 0.6})`
                          : `rgba(34, 197, 94, ${0.15 + intensity * 0.4})`;
                    return (
                      <td
                        key={c.id}
                        className="rounded-md p-2 text-center font-semibold text-foreground"
                        style={{ background: color }}
                        title={f.aiInsight}
                      >
                        {pct >= 0 ? "+" : ""}
                        {pct.toFixed(1)}%
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-supply" /> Stabil
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-warning" /> Waspada
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-deficit" /> Inflasi Tinggi
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Prediction table */}
      <Card>
        <CardHeader>
          <CardTitle>Prediksi Inflasi Pangan (Top 8 Risiko)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2">Wilayah</th>
                  <th className="p-2">Komoditas</th>
                  <th className="p-2">Harga Kini</th>
                  <th className="p-2">Prediksi 7d</th>
                  <th className="p-2">Inflasi</th>
                  <th className="p-2">Trend</th>
                  <th className="p-2">Risiko</th>
                  <th className="p-2">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {topRisk.map((r) => (
                  <tr key={r.regionId + r.komoditasId} className="border-t">
                    <td className="p-2 font-medium">{r.regionName}</td>
                    <td className="p-2">{r.komoditasName}</td>
                    <td className="p-2">Rp {r.currentPrice.toLocaleString("id-ID")}</td>
                    <td className="p-2">Rp {r.predictedPrice.toLocaleString("id-ID")}</td>
                    <td className="p-2">
                      <span
                        className={
                          r.inflationPct > 0 ? "text-deficit font-semibold" : "text-supply font-semibold"
                        }
                      >
                        {r.inflationPct >= 0 ? "+" : ""}
                        {r.inflationPct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="p-2">
                      <TrendBadge t={r.trend} />
                    </td>
                    <td className="p-2">
                      <Badge variant="outline" className={RISK_BG[r.risk]}>
                        <span className={`mr-1 h-2 w-2 rounded-full ${RISK_DOT[r.risk]}`} />
                        {r.risk}
                      </Badge>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-analytics"
                            style={{ width: `${Math.round(r.confidence * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs">{Math.round(r.confidence * 100)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* AI Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-analytics" /> AI Insight Otomatis
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {filtered.slice(0, 6).map((r) => (
            <div
              key={r.regionId}
              className="rounded-lg border bg-card/50 p-4 transition hover:border-analytics/40"
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold">{r.regionName}</div>
                <Badge variant="outline" className={RISK_BG[r.risk]}>
                  {r.risk}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{r.aiInsight}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CloudRain className="h-3 w-3" /> {r.external.weather}
                </span>
                <span className="flex items-center gap-1">
                  <Truck className="h-3 w-3" /> {r.external.logistics}
                </span>
                {r.external.holiday && <Badge variant="secondary">Hari Besar</Badge>}
                {r.external.disruption && (
                  <Badge className="bg-deficit text-white">Gangguan Logistik</Badge>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: string | number;
  tone: "supply" | "deficit" | "warning" | "analytics";
}) {
  const tones: Record<string, string> = {
    supply: "text-supply bg-supply/10",
    deficit: "text-deficit bg-deficit/10",
    warning: "text-warning bg-warning/10",
    analytics: "text-analytics bg-analytics/10",
  };
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card/60 p-3 backdrop-blur">
      <div className={`grid h-9 w-9 place-items-center rounded-lg ${tones[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-bold">{value}</div>
      </div>
    </div>
  );
}

function TrendBadge({ t }: { t: CommodityForecast["trend"] }) {
  if (t === "naik")
    return (
      <Badge className="bg-deficit/15 text-deficit border border-deficit/30">
        <TrendingUp className="mr-1 h-3 w-3" /> Naik
      </Badge>
    );
  if (t === "turun")
    return (
      <Badge className="bg-supply/15 text-supply border border-supply/30">
        <TrendingDown className="mr-1 h-3 w-3" /> Turun
      </Badge>
    );
  if (t === "tidak-stabil")
    return (
      <Badge className="bg-warning/15 text-warning border border-warning/30">
        <Activity className="mr-1 h-3 w-3" /> Volatil
      </Badge>
    );
  return <Badge variant="outline">Stabil</Badge>;
}
