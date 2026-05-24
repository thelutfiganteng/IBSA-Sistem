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
import { applyClusters, computeRegionMetrics } from "@/lib/kmeans";
import { generateForecasts } from "@/lib/forecast";
import { COMMODITIES, MARKETS, REGIONS } from "@/lib/seed";
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
  const data = useMemo(() => {
    if (!mounted) return null;
    const weighs = store.weighs.get();
    const metrics = applyClusters(computeRegionMetrics(weighs));
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
        name: REGIONS.find((r) => r.id === m.regionId)?.name.replace("Kab. ", "").replace("Kota ", "") ?? m.regionId,
        supply: m.totalSupply,
        demand: m.totalDemand,
      }))
      .sort((a, b) => b.supply - a.supply)
      .slice(0, 10);
    // Inflasi trend (dummy)
    const inflasi = days.map((d, i) => ({
      d: d.d,
      idx: Math.round(100 + Math.sin(i / 1.5) * 3 + (high ? 2 : 0) + Math.random() * 2),
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

  if (!data) return <div className="text-muted-foreground">Memuat data…</div>;

  return (
    <div className="space-y-6">
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
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={70} />
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
            <CardTitle>Tren Inflasi Pangan</CardTitle>
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
            Prediksi Tren & Inflasi Pangan
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
