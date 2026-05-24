import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMounted } from "@/hooks/use-mounted";
import { store } from "@/lib/storage";
import { applyClusters, computeRegionMetrics } from "@/lib/kmeans";
import { generateInsights, generateRecommendations } from "@/lib/ai";
import { generateForecasts, type RiskLevel } from "@/lib/forecast";
import { detectAnomalies, summarizeAnomalies, type Anomaly } from "@/lib/price-intel";
import { COMMODITIES, REGIONS } from "@/lib/seed";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Brain,
  CloudRain,
  Eye,
  Flame,
  Gauge,
  Lightbulb,
  Radio,
  ScanLine,
  ShieldAlert,
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
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

export const Route = createFileRoute("/ai-center")({ component: () => <AppShell><AiCenter /></AppShell> });

// Skeuomorphic surface — soft shadows, gradients, inner highlights
const skeu =
  "relative rounded-2xl border border-white/40 bg-gradient-to-br from-background via-card to-muted/30 " +
  "shadow-[0_10px_30px_-15px_rgba(15,42,90,0.35),inset_0_1px_0_0_rgba(255,255,255,0.6)] " +
  "transition-all duration-300 hover:shadow-[0_20px_45px_-20px_rgba(15,42,90,0.45),inset_0_1px_0_0_rgba(255,255,255,0.8)]";

const RISK_BG: Record<RiskLevel, string> = {
  Low: "bg-supply/15 text-supply border-supply/30",
  Medium: "bg-warning/15 text-warning border-warning/30",
  High: "bg-deficit/15 text-deficit border-deficit/30",
};

const KIND_META: Record<Anomaly["jenis"], { label: string; icon: any; color: string }> = {
  "harga-lonjakan": { label: "Lonjakan Harga", icon: Flame, color: "text-deficit" },
  "harga-manipulatif": { label: "Harga Manipulatif", icon: ShieldAlert, color: "text-amber-600" },
  "supply-turun": { label: "Supply Turun", icon: TrendingDown, color: "text-orange-600" },
  "timbangan-ekstrem": { label: "Timbangan Tidak Wajar", icon: AlertOctagon, color: "text-rose-600" },
  "input-duplikat": { label: "Input Duplikat", icon: Eye, color: "text-blue-600" },
};

const SEV_BADGE = {
  high: "bg-deficit text-white",
  medium: "bg-amber-500 text-white",
  low: "bg-supply text-white",
} as const;

function AiCenter() {
  const mounted = useMounted();
  const [tick, setTick] = useState(0);
  const [komoditas, setKomoditas] = useState("cabai");

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 8000);
    return () => clearInterval(id);
  }, []);

  const data = useMemo(() => {
    if (!mounted) return null;
    const w = store.weighs.get();
    const m = applyClusters(computeRegionMetrics(w));
    return {
      weighs: w,
      metrics: m,
      insights: generateInsights(m, w),
      recs: generateRecommendations(m),
      forecasts: generateForecasts(w, m),
      anomalies: detectAnomalies(w),
    };
  }, [mounted, tick]);

  if (!data) return <div className="text-muted-foreground">Memuat AI Engine…</div>;

  const anomalySummary = summarizeAnomalies(data.anomalies);
  const highRisk = data.forecasts.rows.filter((r) => r.risk === "High").length;
  const medRisk = data.forecasts.rows.filter((r) => r.risk === "Medium").length;
  const lowRisk = data.forecasts.rows.filter((r) => r.risk === "Low").length;
  const avgConf =
    data.forecasts.rows.reduce((s, r) => s + r.confidence, 0) / Math.max(data.forecasts.rows.length, 1);

  const filteredFc = data.forecasts.rows.filter((r) => r.komoditasId === komoditas);
  const horizonLen = filteredFc[0]?.forecast.length ?? 0;
  const histLen = filteredFc[0]?.history.length ?? 0;
  const trendSeries = Array.from({ length: histLen + horizonLen }, (_, i) => {
    const isHist = i < histLen;
    const pts = filteredFc.map((r) => (isHist ? r.history[i] : r.forecast[i - histLen]));
    const avgPrice = pts.reduce((s, p) => s + (p?.price ?? 0), 0) / Math.max(pts.length, 1);
    const avgSupply = pts.reduce((s, p) => s + (p?.supply ?? 0), 0) / Math.max(pts.length, 1);
    return {
      date: pts[0]?.date ?? "",
      hist: isHist ? Math.round(avgPrice) : null,
      forecast: isHist ? null : Math.round(avgPrice),
      supply: Math.round(avgSupply),
    };
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ============ Hero — Visual Hierarchy Level 1 ============ */}
      <div className={`${skeu} overflow-hidden p-6`}>
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-analytics/10 pointer-events-none" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-analytics/30 bg-analytics/10 px-3 py-1 text-xs uppercase tracking-widest text-analytics shadow-inner">
              <Brain className="h-3.5 w-3.5" />
              AI Command Center · Live
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-analytics opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-analytics" />
              </span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-br from-foreground to-primary bg-clip-text text-transparent">
              Unified AI Intelligence
            </h2>
            <p className="max-w-xl text-sm text-muted-foreground">
              Analytics, anomaly detection, dan forecasting dalam satu pusat kendali — didukung K-Means, Linear Regression, dan rule-based AI.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricChip icon={ShieldAlert} label="Anomali" value={anomalySummary.total} tone="warning" />
            <MetricChip icon={Flame} label="High Risk" value={highRisk} tone="deficit" />
            <MetricChip icon={Activity} label="Medium" value={medRisk} tone="warning" />
            <MetricChip icon={Gauge} label="Confidence" value={`${Math.round(avgConf * 100)}%`} tone="analytics" />
          </div>
        </div>
      </div>

      {/* ============ Tabs — single section, no page hopping ============ */}
      <Tabs defaultValue="analytics" className="space-y-5">
        <TabsList className={`${skeu} h-12 w-full justify-start gap-1 p-1.5`}>
          <TabsTrigger value="analytics" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md gap-2 px-4">
            <Sparkles className="h-4 w-4" /> Analytics
          </TabsTrigger>
          <TabsTrigger value="anomaly" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md gap-2 px-4">
            <ShieldAlert className="h-4 w-4" /> Anomaly Detection
            {anomalySummary.high > 0 && <Badge className="bg-deficit text-white">{anomalySummary.high}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="forecast" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md gap-2 px-4">
            <Brain className="h-4 w-4" /> Forecasting
            {highRisk > 0 && <Badge className="bg-deficit text-white">{highRisk}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ===== ANALYTICS ===== */}
        <TabsContent value="analytics" className="space-y-5 animate-fade-in">
          <div className="grid gap-4 lg:grid-cols-12">
            <div className={`${skeu} p-5 lg:col-span-8`}>
              <div className="mb-4 flex items-center gap-2">
                <Brain className="h-5 w-5 text-analytics" />
                <h3 className="text-lg font-semibold">AI Insight Generator</h3>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {data.insights.map((ins, i) => {
                  const Icon = ins.type === "alert" ? AlertTriangle : ins.type === "recommendation" ? Lightbulb : ins.type === "prediction" ? TrendingUp : Sparkles;
                  const sev: Record<string, string> = {
                    info: "border-l-analytics bg-gradient-to-br from-analytics/10 to-transparent",
                    warning: "border-l-warning bg-gradient-to-br from-warning/10 to-transparent",
                    danger: "border-l-deficit bg-gradient-to-br from-deficit/10 to-transparent",
                  };
                  return (
                    <div key={i} className={`group rounded-xl border border-l-4 p-4 shadow-sm transition hover:scale-[1.02] hover:shadow-md ${sev[ins.severity]}`}>
                      <div className="mb-1 flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <div className="font-semibold text-sm">{ins.title}</div>
                        <Badge variant="outline" className="ml-auto text-[10px]">{ins.type}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{ins.message}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={`${skeu} p-5 lg:col-span-4`}>
              <div className="mb-4 flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-warning" />
                <h3 className="text-lg font-semibold">Recommendation Engine</h3>
              </div>
              <div className="space-y-2">
                {data.recs.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada rekomendasi prioritas.</p>}
                {data.recs.slice(0, 5).map((r) => (
                  <div key={r.id} className="rounded-xl border bg-card/60 p-3 shadow-sm transition hover:bg-card hover:shadow-md">
                    <div className="mb-1 flex items-center gap-2">
                      <Truck className="h-3.5 w-3.5 text-supply" />
                      <span className="text-xs font-semibold uppercase tracking-wider">Prioritas {r.priority}</span>
                    </div>
                    <p className="text-xs leading-relaxed">{r.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`${skeu} p-5`}>
            <div className="mb-4 flex items-center gap-2">
              <Zap className="h-5 w-5 text-warning" />
              <h3 className="text-lg font-semibold">Prediksi Inflasi per Wilayah</h3>
            </div>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {data.metrics
                .slice()
                .sort((a, b) => {
                  const order = { High: 0, Medium: 1, Low: 2 } as any;
                  return order[a.inflationRisk!] - order[b.inflationRisk!];
                })
                .map((m) => {
                  const r = REGIONS.find((x) => x.id === m.regionId);
                  return (
                    <div key={m.regionId} className="flex items-center justify-between rounded-xl border bg-card/50 p-3 shadow-sm transition hover:scale-[1.02] hover:shadow-md">
                      <div>
                        <div className="text-sm font-medium">{r?.name}</div>
                        <div className="text-[11px] text-muted-foreground">S {m.totalSupply} · D {m.totalDemand}</div>
                      </div>
                      <Badge className={m.inflationRisk === "High" ? "bg-deficit text-white" : m.inflationRisk === "Medium" ? "bg-warning text-white" : "bg-supply text-white"}>
                        {m.inflationRisk}
                      </Badge>
                    </div>
                  );
                })}
            </div>
          </div>
        </TabsContent>

        {/* ===== ANOMALY ===== */}
        <TabsContent value="anomaly" className="space-y-5 animate-fade-in">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <SkeuStat title="Total" value={anomalySummary.total} icon={<Sparkles />} tone="primary" />
            <SkeuStat title="High" value={anomalySummary.high} icon={<Flame />} tone="danger" />
            <SkeuStat title="Medium" value={anomalySummary.medium} icon={<AlertTriangle />} tone="warning" />
            <SkeuStat title="Low" value={anomalySummary.low} icon={<Eye />} tone="info" />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className={`${skeu} border-deficit/40 p-5`}>
              <div className="mb-3 flex items-center gap-2 text-deficit">
                <Flame className="h-5 w-5" />
                <h3 className="font-semibold">High Risk Market</h3>
              </div>
              {anomalySummary.topMarket ? (
                <>
                  <div className="text-2xl font-bold">{anomalySummary.topMarket.pasarName}</div>
                  <p className="text-sm text-muted-foreground">{anomalySummary.topMarket.count} anomali dalam 24 jam.</p>
                </>
              ) : (<p className="text-sm text-muted-foreground">Tidak ada pasar dengan anomali signifikan.</p>)}
            </div>
            <div className={`${skeu} border-amber-500/40 p-5`}>
              <div className="mb-3 flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
                <h3 className="font-semibold">Most Unstable Commodity</h3>
              </div>
              {anomalySummary.topCommodity ? (
                <>
                  <div className="text-2xl font-bold">{anomalySummary.topCommodity.komoditasName}</div>
                  <p className="text-sm text-muted-foreground">{anomalySummary.topCommodity.count} anomali terdeteksi.</p>
                </>
              ) : (<p className="text-sm text-muted-foreground">Semua komoditas stabil.</p>)}
            </div>
          </div>

          <div className={`${skeu} p-5`}>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScanLine className="h-5 w-5 text-primary animate-pulse" />
                <h3 className="text-lg font-semibold">AI Warning Feed</h3>
              </div>
              <Badge className="bg-supply text-white animate-pulse"><ScanLine className="mr-1 h-3 w-3" /> SCANNING</Badge>
            </div>
            <div className="space-y-3">
              {data.anomalies.length === 0 ? (
                <div className="rounded-xl border bg-supply/10 p-6 text-center text-sm text-muted-foreground">
                  <Sparkles className="mx-auto mb-2 h-8 w-8 text-supply" />
                  Sistem dalam kondisi normal.
                </div>
              ) : (
                data.anomalies.slice(0, 10).map((a) => {
                  const meta = KIND_META[a.jenis];
                  const Icon = meta.icon;
                  return (
                    <div key={a.id} className="flex flex-col gap-3 rounded-xl border bg-gradient-to-r from-card to-muted/20 p-4 shadow-sm transition hover:scale-[1.01] hover:shadow-md md:flex-row md:items-start">
                      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted shadow-inner ${meta.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={SEV_BADGE[a.severity]}>{a.severity.toUpperCase()}</Badge>
                          <Badge variant="outline">{meta.label}</Badge>
                          <span className="text-xs text-muted-foreground">{a.pasarName}</span>
                        </div>
                        <p className="text-sm font-medium">{a.message}</p>
                        <p className="text-xs text-muted-foreground"><Sparkles className="mr-1 inline h-3 w-3" /> {a.recommendation}</p>
                      </div>
                      <div className="flex items-center gap-3 md:flex-col md:items-end">
                        <div className="text-right">
                          <div className="text-[10px] uppercase text-muted-foreground">AI Conf.</div>
                          <div className="text-lg font-bold tabular-nums text-primary">{(a.confidence * 100).toFixed(0)}%</div>
                        </div>
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted shadow-inner">
                          <div className="h-full bg-gradient-to-r from-primary to-analytics transition-all" style={{ width: `${a.confidence * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </TabsContent>

        {/* ===== FORECAST ===== */}
        <TabsContent value="forecast" className="space-y-5 animate-fade-in">
          {data.forecasts.alerts.length > 0 && (
            <div className={`${skeu} border-deficit/40 p-5`}>
              <div className="mb-3 flex items-center gap-2 text-deficit">
                <Radio className="h-5 w-5 animate-pulse" />
                <h3 className="text-lg font-semibold">Early Warning System</h3>
                <Badge className="ml-auto bg-deficit text-white">{data.forecasts.alerts.length} Alert</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {data.forecasts.alerts.slice(0, 6).map((a) => (
                  <div key={a.regionId + a.komoditasId} className="relative overflow-hidden rounded-xl border border-deficit/40 bg-gradient-to-br from-deficit/10 to-transparent p-4 shadow-sm transition hover:scale-[1.01] hover:shadow-md">
                    <Flame className="absolute right-3 top-3 h-4 w-4 animate-pulse text-deficit" />
                    <div className="text-[10px] font-bold uppercase tracking-widest text-deficit">⚠ WARNING</div>
                    <div className="mt-1 font-semibold">{a.komoditasName} · {a.regionName}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{a.aiInsight}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge className="bg-deficit text-white">+{a.inflationPct.toFixed(1)}% 7d</Badge>
                      <Badge variant="outline" className="text-[10px]">Conf {Math.round(a.confidence * 100)}%</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {COMMODITIES.map((c) => (
              <Button key={c.id} variant={komoditas === c.id ? "default" : "outline"} size="sm" onClick={() => setKomoditas(c.id)} className="gap-2 transition hover:scale-105">
                <span>{c.icon}</span> {c.name}
              </Button>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className={`${skeu} p-5 lg:col-span-2`}>
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-analytics" />
                <h3 className="font-semibold">Prediksi Harga 30 Hari</h3>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trendSeries}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <RTooltip />
                  <Legend />
                  <Line type="monotone" dataKey="hist" stroke="var(--analytics)" strokeWidth={2} dot={false} name="Historis" />
                  <Line type="monotone" dataKey="forecast" stroke="var(--warning)" strokeWidth={2} strokeDasharray="6 4" dot={false} name="Prediksi AI" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className={`${skeu} p-5`}>
              <div className="mb-3 flex items-center gap-2">
                <Truck className="h-5 w-5 text-supply" />
                <h3 className="font-semibold">Supply Forecast</h3>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={trendSeries}>
                  <defs>
                    <linearGradient id="supG2" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="var(--supply)" stopOpacity={0.7} />
                      <stop offset="100%" stopColor="var(--supply)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <RTooltip />
                  <Area type="monotone" dataKey="supply" stroke="var(--supply)" fill="url(#supG2)" name="Supply (kg)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={`${skeu} p-5`}>
            <div className="mb-3 flex items-center gap-2">
              <Zap className="h-5 w-5 text-warning" />
              <h3 className="font-semibold">Heatmap Inflasi · Wilayah × Komoditas</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] border-separate border-spacing-1 text-xs">
                <thead>
                  <tr>
                    <th className="text-left p-2">Wilayah</th>
                    {COMMODITIES.map((c) => (<th key={c.id} className="p-2">{c.icon} {c.name}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {REGIONS.map((r) => (
                    <tr key={r.id}>
                      <td className="p-2 font-medium">{r.name}</td>
                      {COMMODITIES.map((c) => {
                        const f = data.forecasts.rows.find((x) => x.regionId === r.id && x.komoditasId === c.id);
                        if (!f) return <td key={c.id} className="p-2" />;
                        const pct = f.inflationPct;
                        const intensity = Math.min(1, Math.abs(pct) / 15);
                        const color = f.risk === "High" ? `rgba(239,68,68,${0.25 + intensity * 0.65})` : f.risk === "Medium" ? `rgba(245,158,11,${0.2 + intensity * 0.6})` : `rgba(34,197,94,${0.15 + intensity * 0.4})`;
                        return (
                          <td key={c.id} className="rounded-md p-2 text-center font-semibold shadow-sm transition hover:scale-110" style={{ background: color }} title={f.aiInsight}>
                            {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={`${skeu} p-5`}>
            <div className="mb-3 flex items-center gap-2">
              <Brain className="h-5 w-5 text-analytics" />
              <h3 className="font-semibold">AI Insight per Wilayah · {COMMODITIES.find((c) => c.id === komoditas)?.name}</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filteredFc.slice(0, 9).map((r) => (
                <div key={r.regionId} className="rounded-xl border bg-card/50 p-3 shadow-sm transition hover:scale-[1.02] hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm">{r.regionName}</div>
                    <Badge variant="outline" className={RISK_BG[r.risk]}>{r.risk}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{r.aiInsight}</p>
                  <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><CloudRain className="h-3 w-3" /> {r.external.weather}</span>
                    <span className="flex items-center gap-1"><Truck className="h-3 w-3" /> {r.external.logistics}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricChip({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string | number; tone: string }) {
  const map: Record<string, string> = {
    supply: "from-supply/20 to-supply/5 text-supply border-supply/30",
    deficit: "from-deficit/20 to-deficit/5 text-deficit border-deficit/30",
    warning: "from-warning/20 to-warning/5 text-warning border-warning/30",
    analytics: "from-analytics/20 to-analytics/5 text-analytics border-analytics/30",
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br p-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5)] ${map[tone] ?? map.analytics}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider opacity-80">{label}</span>
        <Icon className="h-3.5 w-3.5 opacity-70" />
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function SkeuStat({ title, value, icon, tone }: { title: string; value: number; icon: React.ReactNode; tone: "primary" | "danger" | "warning" | "info" }) {
  const map = {
    primary: "from-primary to-primary/70",
    danger: "from-deficit to-deficit/70",
    warning: "from-amber-500 to-amber-400",
    info: "from-supply to-supply/70",
  } as const;
  return (
    <div className="overflow-hidden rounded-2xl border shadow-[0_10px_30px_-15px_rgba(15,42,90,0.35),inset_0_1px_0_0_rgba(255,255,255,0.5)] transition hover:scale-[1.03]">
      <div className={`bg-gradient-to-br ${map[tone]} p-4 text-white`}>
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase opacity-90">{title}</div>
          <div className="opacity-80">{icon}</div>
        </div>
        <div className="mt-2 text-3xl font-bold tabular-nums drop-shadow">{value}</div>
      </div>
    </div>
  );
}
