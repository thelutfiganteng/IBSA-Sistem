import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, BarChart3, Brain, MapPin, Radio, Scale, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SumselMap } from "@/components/SumselMap";
import { useMounted } from "@/hooks/use-mounted";
import { ensureSeed, store } from "@/lib/storage";
import { applyClusters, computeRegionMetrics } from "@/lib/kmeans";
import { REGIONS } from "@/lib/seed";
import type { RegionMetric } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Smart Food Supply Sumsel — Peta Surplus & Defisit Realtime" },
      {
        name: "description",
        content:
          "Pantau distribusi & pasokan pangan Sumatera Selatan secara realtime. Peta clustering surplus-defisit, harga komoditas, dan analitik AI.",
      },
      { property: "og:title", content: "Smart Food Supply Sumsel — Peta Surplus & Defisit Realtime" },
      {
        property: "og:description",
        content:
          "Dashboard pangan Sumsel dengan timbangan digital, clustering K-Means, dan AI analytics.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const mounted = useMounted();
  const [metrics, setMetrics] = useState<RegionMetric[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!mounted) return;
    ensureSeed();
    const recompute = () => {
      const weighs = store.weighs.get();
      const base = computeRegionMetrics(weighs);
      setMetrics(applyClusters(base));
    };
    recompute();
    const id = setInterval(() => {
      setTick((t) => t + 1);
      recompute();
    }, 5000);
    return () => clearInterval(id);
  }, [mounted]);

  const stats = useMemo(() => {
    const totalSupply = metrics.reduce((s, m) => s + m.totalSupply, 0);
    const totalDemand = metrics.reduce((s, m) => s + m.totalDemand, 0);
    const surplus = metrics.filter((m) => (m.cluster ?? "").startsWith("Surplus")).length;
    const defisit = metrics.filter((m) => (m.cluster ?? "").startsWith("Defisit")).length;
    const stabil = metrics.filter((m) => m.cluster === "Stabil").length;
    return { totalSupply, totalDemand, surplus, defisit, stabil };
  }, [metrics]);

  const topSurplus = [...metrics].sort((a, b) => b.surplusDeficit - a.surplusDeficit).slice(0, 4);
  const topDefisit = [...metrics].sort((a, b) => a.surplusDeficit - b.surplusDeficit).slice(0, 4);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* NAV */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Activity className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold">Smart Food Supply</div>
              <div className="text-xs text-muted-foreground">Sumatera Selatan</div>
            </div>
          </div>
          <nav className="hidden items-center gap-6 text-sm md:flex">
            <a href="#peta" className="text-muted-foreground hover:text-foreground">Peta Realtime</a>
            <a href="#wilayah" className="text-muted-foreground hover:text-foreground">Wilayah</a>
            <a href="#fitur" className="text-muted-foreground hover:text-foreground">Fitur</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="outline" size="sm">Masuk</Button>
            </Link>
            <Link to="/dashboard" className="hidden sm:block">
              <Button size="sm">Dashboard <ArrowRight className="ml-1 h-4 w-4" /></Button>
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden border-b">
        <div
          className="absolute inset-0 -z-10 opacity-40"
          style={{
            background:
              "radial-gradient(60% 50% at 20% 10%, hsl(var(--primary)/0.25), transparent 60%), radial-gradient(50% 40% at 90% 30%, hsl(var(--accent)/0.25), transparent 60%)",
          }}
        />
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-2 md:py-20">
          <div className="flex flex-col justify-center">
            <Badge variant="outline" className="mb-4 w-fit gap-1">
              <Radio className="h-3 w-3 animate-pulse text-emerald-500" />
              Live Monitoring · {new Date().toLocaleTimeString("id-ID")}
            </Badge>
            <h1 className="text-3xl font-bold leading-tight md:text-5xl">
              Peta Surplus & Defisit Pangan{" "}
              <span className="bg-gradient-to-r from-primary to-sky-400 bg-clip-text text-transparent">
                Sumatera Selatan
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-muted-foreground md:text-lg">
              Sistem monitoring pasokan komoditas pangan secara realtime dari pasar
              induk Sumsel — terintegrasi timbangan digital, AI analytics, dan
              clustering K-Means wilayah surplus-defisit.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/dashboard">
                <Button size="lg">Lihat Dashboard <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </Link>
              <Link to="/gis-map">
                <Button size="lg" variant="outline">Analisis Clustering</Button>
              </Link>
            </div>
            <div className="mt-8 grid grid-cols-3 gap-3 max-w-md">
              <MiniStat label="Wilayah Surplus" value={stats.surplus} color="text-emerald-600" />
              <MiniStat label="Stabil" value={stats.stabil} color="text-sky-600" />
              <MiniStat label="Defisit" value={stats.defisit} color="text-rose-600" />
            </div>
          </div>

          <Card className="overflow-hidden shadow-xl" id="peta">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">Peta Realtime Sumsel</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Update otomatis tiap 5 detik · {metrics.length} wilayah
                </p>
              </div>
              <Badge variant="secondary" className="gap-1">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                LIVE
              </Badge>
            </CardHeader>
            <CardContent className="p-3">
              {mounted && metrics.length > 0 ? (
                <SumselMap metrics={metrics} key={tick} />
              ) : (
                <div className="grid h-[460px] place-items-center rounded-xl border bg-muted/30 text-sm text-muted-foreground">
                  Memuat peta…
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* WILAYAH SECTION */}
      <section id="wilayah" className="border-b bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold md:text-3xl">Wilayah Surplus & Defisit Tertinggi</h2>
            <p className="mt-2 text-muted-foreground">
              Diperbarui realtime dari hasil clustering K-Means
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-emerald-600">
                  <TrendingUp className="h-5 w-5" /> Top Surplus
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {topSurplus.map((m) => (
                  <RegionRow key={m.regionId} metric={m} positive />
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-rose-600">
                  <TrendingDown className="h-5 w-5" /> Top Defisit
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {topDefisit.map((m) => (
                  <RegionRow key={m.regionId} metric={m} />
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <SummaryCard icon={<Scale className="h-5 w-5" />} label="Total Supply" value={`${stats.totalSupply.toLocaleString("id-ID")} kg`} />
            <SummaryCard icon={<BarChart3 className="h-5 w-5" />} label="Total Demand" value={`${stats.totalDemand.toLocaleString("id-ID")} kg`} />
            <SummaryCard icon={<MapPin className="h-5 w-5" />} label="Wilayah Pantauan" value={`${REGIONS.length}`} />
            <SummaryCard icon={<Radio className="h-5 w-5" />} label="Status" value="ONLINE" valueClass="text-emerald-600" />
          </div>
        </div>
      </section>

      {/* FITUR */}
      <section id="fitur" className="border-b">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold md:text-3xl">Fitur Unggulan</h2>
            <p className="mt-2 text-muted-foreground">Untuk BI, BPS, Pemprov, Dinas Pangan & Pasar Induk</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <FeatureCard icon={<Scale />} title="Timbangan Digital" desc="Integrasi serial/Bluetooth dengan simulasi dummy siap pakai." />
            <FeatureCard icon={<Brain />} title="AI Analytics" desc="Prediksi inflasi, deteksi anomali harga, dan rekomendasi distribusi." />
            <FeatureCard icon={<MapPin />} title="Clustering Wilayah" desc="K-Means 5 kelas: Surplus Tinggi → Defisit Tinggi." />
            <FeatureCard icon={<BarChart3 />} title="Dashboard Realtime" desc="Visualisasi pasokan, harga, dan distribusi komoditas." />
            <FeatureCard icon={<ShieldCheck />} title="Multi-Role Auth" desc="Akses berbasis peran dengan audit log aktivitas." />
            <FeatureCard icon={<Radio />} title="Notifikasi Realtime" desc="Peringatan defisit, lonjakan harga, dan anomali pasokan." />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-10 md:flex-row">
          <div>
            <h3 className="text-xl font-bold md:text-2xl">Siap memantau pangan Sumsel?</h3>
            <p className="text-sm opacity-90">Masuk dengan akun demo untuk eksplorasi penuh.</p>
          </div>
          <div className="flex gap-3">
            <Link to="/login">
              <Button size="lg" variant="secondary">Masuk Demo</Button>
            </Link>
            <Link to="/dashboard">
              <Button size="lg" variant="outline" className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10">
                Buka Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto max-w-7xl px-4 py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Smart Food Supply Monitoring & Clustering System Sumsel
        </div>
      </footer>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border bg-card/60 p-3 backdrop-blur">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function SummaryCard({ icon, label, value, valueClass }: { icon: React.ReactNode; label: string; value: string; valueClass?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">{icon}</div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={`text-lg font-bold ${valueClass ?? ""}`}>{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Card className="transition-all hover:-translate-y-1 hover:shadow-md">
      <CardContent className="p-5">
        <div className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">{icon}</div>
        <div className="font-semibold">{title}</div>
        <div className="mt-1 text-sm text-muted-foreground">{desc}</div>
      </CardContent>
    </Card>
  );
}

const CLUSTER_COLORS: Record<string, string> = {
  "Surplus Tinggi": "#15803d",
  "Surplus Sedang": "#65a30d",
  Stabil: "#0ea5e9",
  "Defisit Sedang": "#f59e0b",
  "Defisit Tinggi": "#dc2626",
};

function RegionRow({ metric, positive }: { metric: RegionMetric; positive?: boolean }) {
  const r = REGIONS.find((x) => x.id === metric.regionId);
  return (
    <div className="flex items-center justify-between rounded-lg border bg-card p-3">
      <div>
        <div className="font-medium">{r?.name}</div>
        <div className="text-xs text-muted-foreground">
          Supply {metric.totalSupply} kg · Demand {metric.totalDemand} kg
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <Badge style={{ background: CLUSTER_COLORS[metric.cluster ?? "Stabil"], color: "white" }}>
          {metric.cluster}
        </Badge>
        <span className={`text-sm font-bold ${positive ? "text-emerald-600" : "text-rose-600"}`}>
          {metric.surplusDeficit > 0 ? "+" : ""}
          {metric.surplusDeficit} kg
        </span>
      </div>
    </div>
  );
}
