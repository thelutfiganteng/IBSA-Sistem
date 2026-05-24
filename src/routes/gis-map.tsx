import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWebsocket } from "@/hooks/use-websocket";
import { useMounted } from "@/hooks/use-mounted";
import { store } from "@/lib/storage";
import { buildGisData, buildDistributionFlows } from "@/lib/price-intel";
import { GisFoodMap } from "@/components/GisFoodMap";
import { applyClusters, computeRegionMetrics, kmeans } from "@/lib/kmeans";
import { REGIONS } from "@/lib/seed";
import {
  CloudRain,
  Globe2,
  MapPin,
  Sparkles,
  Truck,
  TrendingUp,
  ShieldAlert,
  BarChart3,
  Navigation,
  ArrowRight,
  Sun,
  AlertTriangle,
  Info,
  ScatterChart as ScatterIcon,
} from "lucide-react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  ZAxis,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";

const REGION_ADM4_MAP: Record<string, string> = {
  "palembang": "16.71.11.1001",
  "banyuasin": "16.07.03.1001",
  "musi-banyuasin": "16.06.01.1001",
  "lubuklinggau": "16.73.02.1001",
  "muara-enim": "16.03.11.1001",
  "lahat": "16.04.10.1001",
  "oku": "16.01.13.1001",
  "oku-timur": "16.08.03.1001",
  "oku-selatan": "16.09.01.1001",
  "oki": "16.02.04.1001",
  "pali": "16.12.01.1001",
  "prabumulih": "16.74.02.1001",
  "pagaralam": "16.72.03.1001",
  "musi-rawas": "16.05.09.2001",
  "empat-lawang": "16.11.02.1001"
};

const CLUSTER_COLORS: Record<string, string> = {
  "Surplus Tinggi": "#15803d",
  "Surplus Sedang": "#84cc16",
  "Stabil": "#0ea5e9",
  "Defisit Sedang": "#f97316",
  "Defisit Tinggi": "#dc2626",
};

function mapBmkgToInternal(desc?: string): "cerah" | "hujan" | "badai" {
  if (!desc) return "cerah";
  const d = desc.toLowerCase();
  if (d.includes("hujan petir") || d.includes("badai") || d.includes("lebat")) return "badai";
  if (d.includes("hujan") || d.includes("gerimis") || d.includes("basah")) return "hujan";
  return "cerah";
}

export const Route = createFileRoute("/gis-map")({ component: Page });

function Page() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const { status: wsStatus, logs: wsLogs } = useWebsocket();
  const mounted = useMounted();
  const [tick, setTick] = useState(0);

  // Advanced GIS Layer Toggles
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showFlows, setShowFlows] = useState(true);
  const [showWeather, setShowWeather] = useState(true);
  const [showLogistics, setShowLogistics] = useState(true);
  const [showMarkets, setShowMarkets] = useState(true);

  // Selected Region Interactive State
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, []);

  // BMKG Real Weather Integration State
  const [bmkgWeatherData, setBmkgWeatherData] = useState<Record<string, { desc: string; temp: number; hum: number }>>({});
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchWeather = async () => {
      setIsLoadingWeather(true);
      const fetched: Record<string, { desc: string; temp: number; hum: number }> = {};
      
      const promises = Object.entries(REGION_ADM4_MAP).map(async ([regionId, adm4]) => {
        try {
          const res = await fetch(`https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${adm4}`);
          if (!res.ok) throw new Error(`Fetch failed for ${regionId}`);
          const json = await res.json();
          const firstPoint = json.data?.[0];
          if (firstPoint && active) {
            fetched[regionId] = {
              desc: firstPoint.weather_desc,
              temp: Number(firstPoint.t),
              hum: Number(firstPoint.hu),
            };
          }
        } catch (e) {
          console.warn(`[BMKG API fallback] Gagal mengambil data cuaca riil untuk ${regionId}:`, e);
        }
      });

      await Promise.allSettled(promises);
      if (active && Object.keys(fetched).length > 0) {
        setBmkgWeatherData(fetched);
      }
      setIsLoadingWeather(false);
    };

    fetchWeather();
    return () => {
      active = false;
    };
  }, []);

  const weighs = mounted ? store.weighs.get() : [];
  
  // 1. Centralized Data: Compute K-Means metrics and clusters
  const kmeansData = useMemo(() => {
    if (!mounted) return null;
    const baseMetrics = computeRegionMetrics(weighs);
    const km = kmeans(baseMetrics, 5);
    const metrics = applyClusters(baseMetrics);

    const scatterData = metrics.map((m) => ({
      x: m.totalSupply,
      y: m.totalDemand,
      z: Math.abs(m.surplusDeficit) + 30,
      name: REGIONS.find((r) => r.id === m.regionId)?.name,
      cluster: m.cluster,
    }));

    const clusterCount: Record<string, number> = {};
    metrics.forEach((m) => {
      const k = m.cluster ?? "Stabil";
      clusterCount[k] = (clusterCount[k] ?? 0) + 1;
    });
    const pieData = Object.entries(clusterCount).map(([name, value]) => ({ name, value }));

    return { metrics, scatterData, pieData, centroids: km.centroids, labels: km.labels };
  }, [weighs, tick, mounted]);

  // 2. Centralized GIS data populated using the exact K-Means assignments
  const gis = useMemo(() => {
    const baseGis = buildGisData(weighs);
    return baseGis.map((item) => {
      // Find matching K-Means cluster from centralized compute
      const kMatch = kmeansData?.metrics.find((m) => m.regionId === item.regionId);
      const bmkg = bmkgWeatherData[item.regionId];

      const merged = {
        ...item,
        cluster: kMatch?.cluster ?? item.cluster, // Fallback to computed K-Means cluster
      };

      if (bmkg) {
        return {
          ...merged,
          weather: mapBmkgToInternal(bmkg.desc),
          bmkgDesc: bmkg.desc,
          bmkgTemp: bmkg.temp,
          bmkgHum: bmkg.hum,
        };
      }
      return merged;
    });
  }, [weighs, bmkgWeatherData, kmeansData, tick]);

  const flows = useMemo(() => buildDistributionFlows(gis), [gis]);

  // Set default selected region to the one with highest inflation score on load
  useEffect(() => {
    if (gis.length > 0 && !selectedRegionId) {
      const topInf = [...gis].sort((a, b) => b.inflationScore - a.inflationScore)[0];
      if (topInf) {
        setSelectedRegionId(topInf.regionId);
      }
    }
  }, [gis, selectedRegionId]);

  const selectedRegion = useMemo(() => {
    return gis.find((r) => r.regionId === selectedRegionId) || gis[0];
  }, [gis, selectedRegionId]);

  const surplus = gis.filter((g) => g.cluster.startsWith("Surplus"));
  const deficit = gis.filter((g) => g.cluster.startsWith("Defisit"));
  const highInflation = gis.filter((g) => g.inflationScore > 65);
  const weatherAlerts = gis.filter((g) => g.weather !== "cerah");

  // Dynamic Global AI Insights
  const globalInsights = useMemo(() => {
    const insights: string[] = [];
    const topInf = [...gis].sort((a, b) => b.inflationScore - a.inflationScore)[0];
    if (topInf) {
      insights.push(
        `Wilayah ${topInf.regionName} mengalami tekanan inflasi tertinggi di Sumsel (skor ${topInf.inflationScore}/100), didorong oleh volatilitas harga ${topInf.topKomoditas}.`,
      );
    }
    if (flows[0]) {
      insights.push(
        `Distribusi logistik dari ${flows[0].fromName} menuju ${flows[0].toName} (${flows[0].volume.toLocaleString()} kg ${flows[0].komoditas}) direkomendasikan untuk stabilisasi supply.`,
      );
    }
    const criticalDeficit = gis.find((g) => g.cluster === "Defisit Tinggi");
    if (criticalDeficit) {
      insights.push(
        `AI mendeteksi wilayah ${criticalDeficit.regionName} berada dalam status defisit tinggi komoditas ${criticalDeficit.topKomoditas} — butuh pasokan darurat.`,
      );
    }
    return insights;
  }, [gis, flows]);

  // Dynamic Selected Region AI Insights & Recommendations
  const regionMetrics = useMemo(() => {
    if (!selectedRegion) return null;
    const isSurplus = selectedRegion.surplus > 0;
    const cluster = selectedRegion.cluster;
    const color = CLUSTER_COLORS[cluster] || "#0ea5e9";

    let predictionText = "Stabil & Aman";
    let predictionColor = "text-emerald-500";
    if (selectedRegion.inflationScore > 75) {
      predictionText = "Risiko Inflasi Tinggi";
      predictionColor = "text-red-500 animate-pulse";
    } else if (selectedRegion.inflationScore > 45) {
      predictionText = "Tekanan Harga Sedang";
      predictionColor = "text-amber-500";
    }

    const recFlow = flows.find(
      (f) => f.fromRegionId === selectedRegion.regionId || f.toRegionId === selectedRegion.regionId
    );

    let aiInsight = `AI mendeteksi wilayah ${selectedRegion.regionName} saat ini masuk dalam cluster ${cluster}. `;
    if (selectedRegion.cluster === "Defisit Tinggi") {
      aiInsight += `Defisit pasokan yang sangat signifikan terjadi karena keterbatasan stok ${selectedRegion.topKomoditas} lokal.`;
    } else if (selectedRegion.cluster === "Defisit Sedang") {
      aiInsight += `Tingkat demand melampaui supply harian secara tipis untuk komoditas ${selectedRegion.topKomoditas}.`;
    } else if (selectedRegion.cluster === "Surplus Tinggi") {
      aiInsight += `Wilayah ini bertindak sebagai lumbung pangan utama Sumsel dengan kelebihan stok ${selectedRegion.topKomoditas} melimpah.`;
    } else {
      aiInsight += `Pasokan dan konsumsi pangan berada pada tingkat ekuilibrium yang stabil.`;
    }

    let recommendation = "";
    if (selectedRegion.surplus < 0) {
      if (recFlow && recFlow.toRegionId === selectedRegion.regionId) {
        recommendation = `Mobilisasi pasokan harian sebanyak ${recFlow.volume.toLocaleString("id-ID")} kg ${recFlow.komoditas} dari ${recFlow.fromName} untuk menstabilkan harga pasar lokal.`;
      } else {
        recommendation = `Segera rencanakan drop suplai penyangga komoditas ${selectedRegion.topKomoditas} sebesar ${Math.abs(selectedRegion.surplus).toLocaleString("id-ID")} kg dari wilayah surplus terdekat.`;
      }
    } else {
      if (recFlow && recFlow.fromRegionId === selectedRegion.regionId) {
        recommendation = `Salurkan kelebihan suplai ${recFlow.volume.toLocaleString("id-ID")} kg ${recFlow.komoditas} menuju wilayah defisit di ${recFlow.toName}.`;
      } else {
        recommendation = `Optimalkan penyimpanan logistik atau cadangkan stok komoditas untuk mengantisipasi gejolak harga pangan regional.`;
      }
    }

    return {
      cluster,
      color,
      isSurplus,
      predictionText,
      predictionColor,
      aiInsight,
      recommendation,
    };
  }, [selectedRegion, flows]);

  if (!mounted || !kmeansData) return <div className="text-muted-foreground">Memuat Pusat Data Geospasial...</div>;

  return (
    <div className="space-y-6">
      {/* Dynamic Header */}
      <div className="rounded-2xl border bg-gradient-to-r from-primary/10 via-primary/5 to-supply/10 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg">
              <Globe2 className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Smart GIS & AI Clustering Command Center</h2>
              <p className="text-sm text-muted-foreground">
                Integrasi Peta Choropleth Geografis Resmi dengan Pemodelan Analitik Algoritma K-Means (Satu Data Indonesia)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`px-3 py-1 font-bold text-xs uppercase ${
              wsStatus === "connected" 
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400" 
                : wsStatus === "connecting"
                ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
                : "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400"
            }`}>
              <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${
                wsStatus === "connected" ? "bg-emerald-500 animate-ping" : wsStatus === "connecting" ? "bg-amber-500 animate-pulse" : "bg-red-500"
              }`} />
              {wsStatus === "connected" 
                ? "🔌 WS: Connected (Live Stream)" 
                : wsStatus === "connecting"
                ? "🔌 WS: Connecting..."
                : "🔌 WS: Offline Fallback"}
            </Badge>

            <Badge className="bg-primary/95 px-3 py-1 text-white shadow">
              <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" /> SYSTEM ONLINE (ACTIVE)
            </Badge>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Wilayah Surplus" value={surplus.length} color="text-supply" detail="Pasokan Pangan Berlebih" />
        <Kpi label="Wilayah Defisit" value={deficit.length} color="text-deficit" detail="Butuh Mobilisasi Suplai" />
        <Kpi label="Gejolak Harga (High Risk)" value={highInflation.length} color="text-amber-500" detail="Indikasi Kenaikan Ekstrem" />
        <Kpi label="Sinyal Cuaca Buruk (BMKG)" value={weatherAlerts.length} color="text-blue-500" detail="Potensi Gangguan Logistik" />
      </div>

      {/* UNIFIED TABS - GIS MAP & K-MEANS CLUSTERING */}
      <Tabs defaultValue="gis" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2 h-11 border bg-muted/65 p-1">
          <TabsTrigger value="gis" className="text-xs font-semibold gap-2">
            <Globe2 className="h-3.5 w-3.5" /> GIS Smart Food Map
          </TabsTrigger>
          <TabsTrigger value="clustering" className="text-xs font-semibold gap-2">
            <BarChart3 className="h-3.5 w-3.5" /> Analisis K-Means
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: GIS FOOD MAP INTERACTIVE */}
        <TabsContent value="gis" className="space-y-6 animate-fade-in focus:outline-none">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
            {/* Map & Toggle Section (Left Column) */}
            <div className="xl:col-span-3 space-y-6">
              {/* Advanced Layers Toggle Card */}
              <Card className="border border-border/80 shadow-sm">
                <CardHeader className="py-3 px-5 border-b bg-muted/20">
                  <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Navigation className="h-4 w-4 text-primary" /> Sakelar Layer GIS Sumatera Selatan
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-start gap-x-6 gap-y-3 py-4 px-5">
                  <Toggle checked={showBoundaries} onChange={setShowBoundaries} label="Batas Administratif" />
                  <Toggle checked={showHeatmap} onChange={setShowHeatmap} label="Heatmap Inflasi" />
                  <Toggle checked={showFlows} onChange={setShowFlows} label="Jalur Distribusi AI" />
                  <Toggle checked={showMarkets} onChange={setShowMarkets} label="Titik Pasar Induk" />
                  <Toggle checked={showWeather} onChange={setShowWeather} label="Kondisi Cuaca BMKG" />
                  <Toggle checked={showLogistics} onChange={setShowLogistics} label="Kepadatan Rute Logistik" />
                </CardContent>
              </Card>

              {/* Large Interactive Fullscreen-style Map */}
              <Card className="border border-border/80 shadow-lg overflow-hidden">
                <CardContent className="p-0 relative">
                  <GisFoodMap
                    data={gis}
                    flows={flows}
                    showBoundaries={showBoundaries}
                    showHeatmap={showHeatmap}
                    showFlows={showFlows}
                    showWeather={showWeather}
                    showLogistics={showLogistics}
                    showMarkets={showMarkets}
                    height="h-[400px] lg:h-[620px]"
                    onSelectRegion={setSelectedRegionId}
                    selectedRegionId={selectedRegionId || undefined}
                  />
                  {/* Overlay Tip */}
                  <div className="absolute top-4 left-4 z-[1000] bg-background/80 border border-border/80 shadow-md rounded-lg px-3 py-1.5 backdrop-blur text-xs flex items-center gap-2 font-medium">
                    <Info className="h-3.5 w-3.5 text-primary" />
                    <span>Klik wilayah pada peta untuk melihat detail AI Insight</span>
                  </div>
                </CardContent>
              </Card>

              {/* Real-time Socket.io Live Packet Feed */}
              <Card className="border border-border/80 shadow-md bg-slate-950 text-slate-100 font-mono">
                <CardHeader className="py-3 px-5 border-b border-slate-800 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs uppercase tracking-wider text-slate-400 flex items-center gap-2 font-mono">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    Live Socket.io Telemetry Terminal
                  </CardTitle>
                  <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-bold font-mono">
                    Real-Time stream
                  </span>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="h-32 overflow-y-auto space-y-1.5 text-xs select-text">
                    {wsLogs.length === 0 ? (
                      <div className="text-slate-500 italic flex items-center justify-center h-full">
                        Waiting for WebSocket connection handshake...
                      </div>
                    ) : (
                      wsLogs.map((log) => (
                        <div key={log.id} className="flex items-start gap-2 border-b border-slate-900 pb-1 last:border-0 font-mono leading-relaxed">
                          <span className="text-slate-500 font-semibold shrink-0">[{log.timestamp}]</span>
                          <span className={`shrink-0 ${
                            log.event && (log.event.includes("SUCCESS") || log.event.includes("CONNECTED"))
                              ? "text-emerald-400 font-bold"
                              : log.event && log.event.includes("emit")
                              ? "text-cyan-400 font-bold"
                              : "text-amber-400"
                          }`}>
                            {log.event}
                          </span>
                          <span className="text-slate-300 flex-1 truncate font-medium">
                            {JSON.stringify(log.payload)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Real-time Global AI Geographic Insights Feed */}
              <Card className="border border-border/80 shadow-md">
                <CardHeader className="py-4 px-5 border-b bg-muted/10">
                  <CardTitle className="flex items-center gap-2 text-sm font-bold">
                    <Sparkles className="h-5 w-5 text-amber-500" /> Ringkasan Analitis Geografis AI
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-3">
                  {globalInsights.map((t, i) => (
                    <div key={i} className="flex gap-3 rounded-xl border border-primary/10 bg-primary/5 p-4 text-sm transition-all hover:bg-primary/10">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div className="font-medium text-foreground/90">{t}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Selected Region AI Insights Panel (Right Column) */}
            <div className="xl:col-span-1 space-y-6">
              {selectedRegion && regionMetrics ? (
                <Card className="border border-border/80 shadow-lg bg-background/50 backdrop-blur-md sticky top-24 overflow-hidden">
                  <div className="p-5 text-white bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-950 dark:to-slate-900 border-b border-border/40">
                    <div className="text-xs uppercase tracking-wider opacity-60 font-semibold mb-1">
                      Wilayah Terpilih
                    </div>
                    <h3 className="text-xl font-bold tracking-tight mb-2 flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-cyan-400" />
                      {selectedRegion.regionName}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span 
                        className="inline-block h-3.5 w-3.5 rounded-full ring-2 ring-white/20"
                        style={{ backgroundColor: regionMetrics.color }}
                      />
                      <Badge variant="outline" className="text-white border-white/20 text-xs px-2 py-0.5 font-bold uppercase" style={{ backgroundColor: `${regionMetrics.color}33` }}>
                        {regionMetrics.cluster}
                      </Badge>
                    </div>
                  </div>

                  <CardContent className="p-5 space-y-6">
                    {/* Section A: Supply / Demand Balance */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <BarChart3 className="h-4 w-4 text-primary" /> Neraca Supply & Demand
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border bg-muted/40 p-3 shadow-sm">
                          <div className="text-[10px] uppercase font-semibold text-muted-foreground">Suplai Masuk</div>
                          <div className="mt-1 text-base font-bold text-foreground tabular-nums">
                            {selectedRegion.supply.toLocaleString("id-ID")} <span className="text-[10px] font-normal text-muted-foreground">kg</span>
                          </div>
                        </div>
                        <div className="rounded-xl border bg-muted/40 p-3 shadow-sm">
                          <div className="text-[10px] uppercase font-semibold text-muted-foreground">Konsumsi (Demand)</div>
                          <div className="mt-1 text-base font-bold text-foreground tabular-nums">
                            {selectedRegion.demand.toLocaleString("id-ID")} <span className="text-[10px] font-normal text-muted-foreground">kg</span>
                          </div>
                        </div>
                      </div>

                      {/* Net Balance Status */}
                      <div className={`rounded-xl border p-4 flex items-center justify-between shadow-sm ${regionMetrics.isSurplus ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300' : 'bg-red-500/10 border-red-500/20 text-red-800 dark:text-red-300'}`}>
                        <div>
                          <div className="text-[10px] uppercase font-semibold opacity-75">Selisih Bersih (Net)</div>
                          <div className="text-lg font-extrabold tabular-nums mt-0.5">
                            {selectedRegion.surplus > 0 ? "+" : ""}{selectedRegion.surplus.toLocaleString("id-ID")} kg
                          </div>
                        </div>
                        {regionMetrics.isSurplus ? (
                          <TrendingUp className="h-8 w-8 text-emerald-500" />
                        ) : (
                          <AlertTriangle className="h-8 w-8 text-red-500" />
                        )}
                      </div>
                    </div>

                    {/* Section B: Inflation Forecast */}
                    <div className="space-y-3 border-t pt-5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <TrendingUp className="h-4 w-4 text-primary" /> Prediksi & Risiko Inflasi
                      </h4>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold">Skor Tekanan Inflasi:</span>
                        <span className={`font-bold tabular-nums ${regionMetrics.predictionColor}`}>
                          {selectedRegion.inflationScore} / 100
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-500" 
                          style={{ 
                            width: `${selectedRegion.inflationScore}%`,
                            backgroundColor: regionMetrics.color
                          }} 
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Aman (0)</span>
                        <span>Tinggi (100)</span>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-2.5 text-xs text-center font-bold">
                        Status: <span className={regionMetrics.predictionColor}>{regionMetrics.predictionText}</span>
                      </div>
                    </div>

                    {/* Section C: Logistics & BMKG Weather Status */}
                    <div className="space-y-3 border-t pt-5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <CloudRain className="h-4 w-4 text-primary" /> Logistik & Kondisi Cuaca
                      </h4>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="flex items-center gap-2 rounded-lg border bg-muted/20 p-2.5 min-w-0 flex-1">
                          <span className="text-lg shrink-0">{selectedRegion.weather === "cerah" ? "☀️" : selectedRegion.weather === "hujan" ? "🌧️" : "⛈️"}</span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[9px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                              Cuaca BMKG {selectedRegion.bmkgDesc && <span className="text-[8px] bg-primary/25 text-primary px-1 rounded font-extrabold tracking-wider">RIIL</span>}
                            </div>
                            <div className="font-extrabold capitalize text-xs truncate" title={selectedRegion.bmkgDesc || selectedRegion.weather}>
                              {selectedRegion.bmkgDesc || selectedRegion.weather}
                            </div>
                            {selectedRegion.bmkgTemp && (
                              <div className="text-[9px] text-muted-foreground font-semibold">
                                {selectedRegion.bmkgTemp}°C • {selectedRegion.bmkgHum}% RH
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 rounded-lg border bg-muted/20 p-2.5">
                          <span className="text-lg">{selectedRegion.logistics === "lancar" ? "🟢" : selectedRegion.logistics === "padat" ? "🟡" : "🔴"}</span>
                          <div>
                            <div className="text-[9px] uppercase font-semibold text-muted-foreground">Rute Logistik</div>
                            <div className="font-bold capitalize">{selectedRegion.logistics}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section D: AI Command & Recommendations */}
                    <div className="space-y-3 border-t pt-5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4 text-primary" /> AI Geographic Insight
                      </h4>
                      <div className="rounded-xl border border-primary/10 bg-primary/5 p-4 space-y-3 text-xs text-foreground/90 leading-relaxed shadow-sm">
                        <p className="font-medium">{regionMetrics.aiInsight}</p>
                        <div className="border-t border-primary/10 pt-2.5">
                          <div className="font-bold text-primary uppercase text-[9px] tracking-wider mb-1 flex items-center gap-1">
                            <Truck className="h-3 w-3 text-primary animate-bounce" /> Rekomendasi Distribusi
                          </div>
                          <p className="font-semibold text-foreground/90">{regionMetrics.recommendation}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border border-dashed p-6 text-center text-muted-foreground flex flex-col items-center justify-center h-80">
                  <MapPin className="h-10 w-10 text-muted-foreground/45 mb-3" />
                  <p className="text-sm font-medium">Klik pada wilayah administratif di map untuk memunculkan AI Command Panel wilayah.</p>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: K-MEANS CLUSTERING ANALYTICS */}
        <TabsContent value="clustering" className="space-y-6 animate-fade-in focus:outline-none">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Scatter Plot (Supply vs Demand) */}
            <Card className="lg:col-span-2 border border-border/80 shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-bold">
                  <ScatterIcon className="h-4 w-4 text-primary" /> Scatter Plot Clustering (Supply vs Demand)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={340}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" dataKey="x" name="Supply" unit="kg" fontSize={11} />
                    <YAxis type="number" dataKey="y" name="Demand" unit="kg" fontSize={11} />
                    <ZAxis type="number" dataKey="z" range={[60, 400]} />
                    <RechartsTooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="rounded-lg border bg-card p-2.5 text-xs shadow-md backdrop-blur">
                            <div className="font-bold text-foreground mb-1">{d.name}</div>
                            <div className="text-muted-foreground">Supply: <span className="font-bold text-foreground">{d.x.toLocaleString("id-ID")} kg</span></div>
                            <div className="text-muted-foreground">Demand: <span className="font-bold text-foreground">{d.y.toLocaleString("id-ID")} kg</span></div>
                            <div className="mt-1 flex items-center gap-1.5">
                              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: CLUSTER_COLORS[d.cluster] }} />
                              <span className="font-bold" style={{ color: CLUSTER_COLORS[d.cluster] }}>{d.cluster}</span>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Scatter data={kmeansData.scatterData}>
                      {kmeansData.scatterData.map((d, i) => (
                        <Cell key={i} fill={CLUSTER_COLORS[d.cluster ?? "Stabil"]} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Pie Chart (Cluster Distribution) */}
            <Card className="border border-border/80 shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-bold">
                  <BarChart3 className="h-4 w-4 text-primary" /> Distribusi Cluster Wilayah
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={kmeansData.pieData} dataKey="value" nameKey="name" outerRadius={80} label>
                      {kmeansData.pieData.map((d, i) => (
                        <Cell key={i} fill={CLUSTER_COLORS[d.name]} />
                      ))}
                    </Pie>
                    <Legend verticalAlign="bottom" height={36} iconSize={10} wrapperStyle={{ fontSize: 10 }} />
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Centroids & Variables description */}
          <Card className="border border-border/80 shadow-md">
            <CardHeader className="py-4 px-5 border-b bg-muted/10">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Metodologi Pengelompokan K-Means
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-3 text-xs text-muted-foreground leading-relaxed">
              <p>
                Sistem mengelompokkan 15 wilayah kabupaten/kota di Sumatera Selatan ke dalam 5 kelas klasifikasi ketahanan pangan: 
                <span className="text-supply font-bold"> Surplus Tinggi</span>, 
                <span className="text-lime-500 font-bold"> Surplus Sedang</span>, 
                <span className="text-sky-500 font-bold"> Stabil</span>, 
                <span className="text-amber-500 font-bold"> Defisit Sedang</span>, dan 
                <span className="text-deficit font-bold"> Defisit Tinggi</span>.
              </p>
              <p>
                <b>Variabel Input AI:</b> total volume pasokan masuk (Total Supply), estimasi kebutuhan pangan penduduk (Total Demand), rata-rata harga pasar strategis (Avg Price), volume sebaran antardinas (Distribution), frekuensi penimbangan IoT (Frequency), persediaan stok cadangan daerah (Stok Gudang), jumlah pasar induk aktif, dan selisih bersih surplus-defisit.
              </p>
              <p>
                Proses clustering memproses data dengan normalisasi Min-Max, dilanjutkan pencarian jarak terpendek menggunakan rumus *Euclidean Distance*, dan diulang hingga titik centroid stabil. Ini menghasilkan validitas pemetaan ketahanan pangan yang sangat akurat.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Geospatial Detailed Table (Rendered globally at the bottom) */}
      <Card className="border border-border/80 shadow-md">
        <CardHeader className="py-4 px-5 border-b bg-muted/10">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" /> Tabulasi Data Geospasial Wilayah Sumsel (Centralized)
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground bg-muted/20">
                <th className="py-3 px-5 font-bold">Wilayah Administratif</th>
                <th className="py-3 px-3 text-right font-bold">Total Supply</th>
                <th className="py-3 px-3 text-right font-bold">Total Demand</th>
                <th className="py-3 px-3 text-right font-bold">Selisih (Net)</th>
                <th className="py-3 px-3 text-right font-bold">Skor Inflasi</th>
                <th className="py-3 px-4 font-bold">Cluster AI (K-Means)</th>
                <th className="py-3 px-3 font-bold">Cuaca</th>
                <th className="py-3 px-3 font-bold">Logistik</th>
                <th className="py-3 px-5 font-bold">Komoditas Utama</th>
              </tr>
            </thead>
            <tbody>
              {gis.map((r) => {
                const clusterName = r.cluster;
                const color = CLUSTER_COLORS[clusterName] || "#0ea5e9";
                const isSelected = selectedRegionId === r.regionId;

                return (
                  <tr 
                    key={r.regionId} 
                    onClick={() => setSelectedRegionId(r.regionId)}
                    className={`border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors ${isSelected ? 'bg-primary/5 font-semibold text-primary' : ''}`}
                  >
                    <td className="py-3 px-5 font-medium flex items-center gap-2">
                      {isSelected && <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />}
                      {r.regionName}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums">{r.supply.toLocaleString("id-ID")} kg</td>
                    <td className="py-3 px-3 text-right tabular-nums">{r.demand.toLocaleString("id-ID")} kg</td>
                    <td className={`py-3 px-3 text-right tabular-nums font-bold ${r.surplus >= 0 ? "text-supply" : "text-deficit"}`}>
                      {r.surplus >= 0 ? "+" : ""}{r.surplus.toLocaleString("id-ID")} kg
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-bold ${r.inflationScore > 70 ? "bg-deficit/20 text-deficit" : r.inflationScore > 45 ? "bg-amber-500/20 text-amber-700" : "bg-supply/20 text-supply"}`}
                      >
                        {r.inflationScore}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: color }}>
                        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                        {clusterName}
                      </span>
                    </td>
                    <td className="py-3 px-3 capitalize font-medium">
                      {r.weather === "cerah" ? "☀️ Cerah" : r.weather === "hujan" ? "🌧️ Hujan" : "⛈️ Badai"}
                    </td>
                    <td className="py-3 px-3 capitalize font-medium">
                      {r.logistics === "lancar" ? "🟢 Lancar" : r.logistics === "padat" ? "🟡 Padat" : "🔴 Macet"}
                    </td>
                    <td className="py-3 px-5 font-medium">{r.topKomoditas}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Distribution flows and paths details */}
      <Card className="border border-border/80 shadow-md">
        <CardHeader className="py-4 px-5 border-b bg-muted/10">
          <CardTitle className="flex items-center gap-2 text-sm font-bold">
            <Truck className="h-5 w-5 text-primary" /> Feed Rekomendasi Jalur Distribusi Logistik
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 space-y-3">
          {flows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada rekomendasi distribusi logistik saat ini.</p>
          ) : (
            flows.map((f, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 rounded-xl border p-4 text-sm transition-all hover:bg-muted/30">
                <Badge className="bg-primary/95 text-white font-bold py-1 px-2">{f.volume.toLocaleString("id-ID")} kg</Badge>
                <div className="flex items-center gap-2 font-medium">
                  <span className="font-bold text-foreground">{f.fromName}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-bold text-foreground">{f.toName}</span>
                </div>
                <div className="text-xs text-muted-foreground font-semibold md:ml-auto">
                  Komoditas Utama: <span className="text-primary font-bold">{f.komoditas}</span>
                </div>
                <TrendingUp className="ml-auto md:ml-2 h-4 w-4 text-emerald-500" />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, color, detail }: { label: string; value: number; color: string; detail?: string }) {
  return (
    <Card className="border border-border/80 shadow-md transition-all hover:shadow-lg hover:-translate-y-0.5">
      <CardContent className="p-5">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`mt-2 text-4xl font-extrabold tabular-nums ${color}`}>{value}</div>
        {detail && <div className="mt-1 text-xs text-muted-foreground/80 font-medium">{detail}</div>}
      </CardContent>
    </Card>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-xs font-bold select-none py-1.5 px-3 rounded-lg border bg-background/50 hover:bg-muted transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4.5 w-4.5 rounded-md border-input bg-background accent-primary text-primary transition-all cursor-pointer"
      />
      <span className="text-foreground/90">{label}</span>
    </label>
  );
}
