import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { StatCard } from "@/components/StatCard";
import { SumselMap } from "@/components/SumselMap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMounted } from "@/hooks/use-mounted";
import { store } from "@/lib/storage";
import { computeRegionMetrics } from "@/lib/kmeans";
import { generateForecasts } from "@/lib/forecast";
import { COMMODITIES, MARKETS } from "@/lib/seed";
import { useIntelligenceMemo } from "@/lib/intelligence-store";
import { statusBgClass, foodScoreColor } from "@/lib/intelligence-core";
import {
  Boxes,
  Building2,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Activity,
  Brain,
  ArrowRight,
  Radio,
  Zap,
  Shield,
  Target,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
  RadialBarChart,
  RadialBar,
} from "recharts";

export const Route = createFileRoute("/dashboard")({ component: DashboardPage });

function DashboardPage() {
  return (
    <AppShell>
      <DashboardInner />
    </AppShell>
  );
}

function DashboardInner() {
  const mounted = useMounted();
  const snapshot = useIntelligenceMemo(mounted);

  const data = useMemo(() => {
    if (!mounted || !snapshot) return null;
    const weighs = store.weighs.get();
    const metrics = snapshot.metrics;
    const today = new Date().toDateString();
    const todayRows = weighs.filter((w) => new Date(w.tanggal).toDateString() === today);
    const surplus = metrics.filter((m) => m.surplusDeficit > 0).length;
    const deficit = metrics.filter((m) => m.surplusDeficit < 0).length;
    const high = metrics.filter((m) => m.inflationRisk === "High").length;

    // Daily supply (7 days)
    const days: { d: string; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      const key = dt.toDateString();
      const t = weighs
        .filter((w) => new Date(w.tanggal).toDateString() === key)
        .reduce((s, w) => s + w.berat, 0);
      days.push({ d: dt.toLocaleDateString("id-ID", { day: "2-digit", month: "short" }), total: t });
    }
    // Distribution per commodity
    const byCom = COMMODITIES.map((c) => ({
      name: c.name,
      total: weighs.filter((w) => w.komoditasId === c.id).reduce((s, w) => s + w.berat, 0),
      harga: Math.round(
        weighs.filter((w) => w.komoditasId === c.id).reduce((s, w) => s + w.harga, 0) /
          Math.max(weighs.filter((w) => w.komoditasId === c.id).length, 1),
      ),
    }));
    // Distribusi per wilayah
    const byReg = metrics
      .map((m) => ({
        name:
          COMMODITIES.find(() => true)?.name ?? // just for brevity
          m.regionId.replace("kab-", "").replace(/-/g, " "),
        shortName: m.regionName.replace("Kab. ", "").replace("Kota ", ""),
        supply: m.totalSupply,
        demand: m.totalDemand,
      }))
      .sort((a, b) => b.supply - a.supply)
      .slice(0, 10);
    // Inflasi trend (deterministic seed)
    const inflasi = days.map((d, i) => ({
      d: d.d,
      idx: Math.round(100 + Math.sin(i / 1.5) * 3 + (high ? 2 : 0) + Math.sin(i * 2.1) * 1.5),
    }));

    const forecast = generateForecasts(weighs, metrics);

    return {
      weighs,
      metrics,
      today: todayRows.length,
      totalSupply: weighs.reduce((s, w) => s + w.berat, 0),
      surplus,
      deficit,
      high,
      days,
      byCom,
      byReg,
      inflasi,
      forecast,
    };
  }, [mounted]);

  if (!data || !snapshot)
    return <div className="text-muted-foreground">Memuat data…</div>;

  const activeEvents = snapshot.activeEvents.filter((e) => e.active);
  const foodScoreData = [
    { name: "Food Score", value: snapshot.globalFoodScore, fill: foodScoreColor(snapshot.globalFoodScore) },
  ];

  return (
    <div className="space-y-6">

      {/* Context Events Banner */}
      {activeEvents.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2">
          <Zap className="h-4 w-4 text-amber-400 animate-pulse shrink-0" />
          <span className="text-xs font-semibold text-amber-300 mr-1">AI Dynamic Context:</span>
          {activeEvents.map((e) => (
            <Badge
              key={e.name}
              className="border border-amber-500/40 bg-amber-500/20 text-amber-300 text-xs"
            >
              {e.icon} {e.name} — threshold ×{snapshot.metrics[0]?.dynamicThresholdMultiplier.toFixed(2)}
            </Badge>
          ))}
        </div>
      )}

      {/* Global Intelligence Header Row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

        {/* Food Security Score Gauge */}
        <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-background relative overflow-hidden">
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4 text-emerald-400" />
              Food Security Score
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 flex items-center justify-center">
            <div className="relative flex flex-col items-center">
              <ResponsiveContainer width={140} height={140}>
                <RadialBarChart
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={65}
                  data={foodScoreData}
                  startAngle={225}
                  endAngle={-45}
                >
                  <RadialBar dataKey="value" cornerRadius={8} background={{ fill: "#1f2937" }} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center mt-2">
                <div
                  className="text-3xl font-black"
                  style={{ color: foodScoreColor(snapshot.globalFoodScore) }}
                >
                  {snapshot.globalFoodScore}
                </div>
                <div className="text-[10px] text-muted-foreground">dari 100</div>
              </div>
              <div className="mt-2 text-center">
                <Badge className={statusBgClass(snapshot.sumselStatus) + " text-xs border"}>
                  {snapshot.sumselStatus}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Global SDR + Status Card */}
        <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-background">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Target className="h-4 w-4 text-blue-400" />
              Supply Demand Ratio (SDR) Sumsel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-2">
              <span className="text-4xl font-black text-blue-300">{snapshot.globalSDR.toFixed(3)}</span>
              <span className="text-sm text-muted-foreground mb-1">SDR</span>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Target ideal:</span>
                <span className="text-emerald-400 font-medium">0.95 – 1.20</span>
              </div>
              <div className="flex justify-between">
                <span>Status saat ini:</span>
                <Badge className={statusBgClass(snapshot.sumselStatus) + " text-xs border"}>
                  {snapshot.sumselStatus}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span>Threshold multiplier:</span>
                <span className="text-amber-400 font-mono">
                  ×{(snapshot.metrics[0]?.dynamicThresholdMultiplier ?? 1).toFixed(2)}
                </span>
              </div>
            </div>
            {/* SDR visual bar */}
            <div className="relative h-2 rounded-full bg-gray-700 overflow-hidden">
              <div
                className="absolute h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, snapshot.globalSDR * 50)}%`,
                  background: foodScoreColor(snapshot.globalFoodScore),
                }}
              />
              {/* Target zone marker */}
              <div className="absolute h-full w-[2px] bg-emerald-400 opacity-70" style={{ left: "47.5%" }} />
              <div className="absolute h-full w-[2px] bg-emerald-400 opacity-70" style={{ left: "60%" }} />
            </div>
          </CardContent>
        </Card>

        {/* Regional Status Summary */}
        <Card className="border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-background">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Brain className="h-4 w-4 text-purple-400" />
              Status Wilayah Sumsel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: "Surplus", count: snapshot.totalSurplusRegions, color: "text-emerald-400" },
                { label: "Stabil", count: snapshot.totalStableRegions, color: "text-yellow-400" },
                { label: "Defisit", count: snapshot.totalDeficitRegions, color: "text-orange-400" },
                { label: "Krisis", count: snapshot.totalCrisisRegions, color: "text-red-400" },
                { label: "Risiko Tinggi", count: data.high, color: "text-red-300" },
                { label: "Pasar Aktif", count: MARKETS.length, color: "text-blue-400" },
              ].map((item) => (
                <div key={item.label} className="rounded-lg bg-background/50 p-2">
                  <div className={`text-2xl font-black ${item.color}`}>{item.count}</div>
                  <div className="text-[10px] text-muted-foreground">{item.label}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPI Stats Row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Supply Hari Ini"
          value={data.days[data.days.length - 1].total.toLocaleString("id-ID")}
          suffix="kg"
          icon={Activity}
          tone="supply"
        />
        <StatCard
          label="Komoditas Masuk"
          value={data.today}
          suffix="trx"
          icon={Boxes}
          tone="analytics"
        />
        <StatCard
          label="Pasar Aktif"
          value={MARKETS.length}
          icon={Building2}
          tone="default"
        />
        <StatCard label="Daerah Surplus" value={data.surplus} icon={TrendingUp} tone="supply" />
        <StatCard label="Daerah Defisit" value={data.deficit} icon={TrendingDown} tone="deficit" />
        <StatCard
          label="Risiko Inflasi Tinggi"
          value={data.high}
          icon={AlertTriangle}
          tone="warning"
        />
      </div>

      {/* Food Security Score per Region */}
      <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-background">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Shield className="h-4 w-4 text-emerald-400" />
            Food Security Score per Wilayah
            <Badge className="ml-auto border border-emerald-500/40 bg-emerald-500/20 text-emerald-300 text-xs">
              <Radio className="mr-1 h-3 w-3 animate-pulse" /> Intelligence Core
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
            {snapshot.metrics
              .sort((a, b) => b.foodSecurityScore - a.foodSecurityScore)
              .slice(0, 15)
              .map((m) => (
                <div
                  key={m.regionId}
                  className="rounded-lg border border-white/10 bg-background/50 px-2 py-2 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-foreground truncate">
                      {m.regionName.replace("Kota ", "").replace("Kab. ", "")}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      SDR {m.sdr.toFixed(2)}
                    </div>
                  </div>
                  <div
                    className="text-lg font-black shrink-0"
                    style={{ color: foodScoreColor(m.foodSecurityScore) }}
                  >
                    {m.foodSecurityScore}
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Supply Pangan Harian (7 hari)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.days}>
                <defs>
                  <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--supply)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="var(--supply)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="d" />
                <YAxis />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="var(--supply)"
                  fill="url(#g1)"
                  name="Total (kg)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Harga Rata-rata Komoditas</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.byCom}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="harga" fill="var(--analytics)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Distribusi Wilayah (Supply vs Demand)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.byReg}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="shortName" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={70} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="supply" fill="var(--supply)" name="Supply" radius={[4, 4, 0, 0]} />
                <Bar dataKey="demand" fill="var(--deficit)" name="Demand" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tren Indeks Inflasi Pangan</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.inflasi}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="d" />
                <YAxis />
                <Tooltip />
                <Line
                  dataKey="idx"
                  stroke="var(--warning)"
                  strokeWidth={2}
                  dot={{ fill: "var(--warning)" }}
                  name="Indeks"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* AI Forecasting Section */}
      <Card className="border-analytics/30 bg-gradient-to-br from-analytics/5 via-background to-background">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-analytics" />
            Prediksi Tren &amp; Inflasi Pangan
            <Badge className="ml-2 bg-analytics/15 text-analytics border-analytics/30 border">
              <Radio className="mr-1 h-3 w-3 animate-pulse" /> AI Live
            </Badge>
            <Link to="/forecasting" className="ml-auto">
              <Button size="sm" variant="ghost" className="gap-1">
                Lihat Detail <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.forecast.alerts.length > 0 && (
            <div className="rounded-lg border border-deficit/40 bg-deficit/5 p-3 text-sm">
              <div className="mb-1 flex items-center gap-2 font-semibold text-deficit">
                <AlertTriangle className="h-4 w-4" />
                Early Warning · {data.forecast.alerts.length} sinyal risiko tinggi
              </div>
              <p className="text-xs text-muted-foreground">
                {data.forecast.alerts[0].aiInsight}
              </p>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {COMMODITIES.map((c) => {
              const rows = data.forecast.rows.filter((r) => r.komoditasId === c.id);
              const avgInfl =
                rows.reduce((s, r) => s + r.inflationPct, 0) / Math.max(rows.length, 1);
              const high = rows.filter((r) => r.risk === "High").length;
              const tone =
                avgInfl > 5 ? "deficit" : avgInfl > 2 ? "warning" : "supply";
              const toneCls: Record<string, string> = {
                deficit: "border-deficit/40 bg-deficit/5 text-deficit",
                warning: "border-warning/40 bg-warning/5 text-warning",
                supply: "border-supply/40 bg-supply/5 text-supply",
              };
              return (
                <div
                  key={c.id}
                  className={`rounded-lg border p-4 transition ${toneCls[tone]}`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xl">{c.icon}</span>
                    {avgInfl >= 0 ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : (
                      <TrendingDown className="h-4 w-4" />
                    )}
                  </div>
                  <div className="text-sm font-medium text-foreground">{c.name}</div>
                  <div className="mt-1 text-2xl font-bold">
                    {avgInfl >= 0 ? "+" : ""}
                    {avgInfl.toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Prediksi inflasi 7d · {high} wilayah high-risk
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Peta Ketahanan Pangan Sumsel</CardTitle>
        </CardHeader>
        <CardContent>
          <SumselMap metrics={data.metrics} />
        </CardContent>
      </Card>
    </div>
  );
}
