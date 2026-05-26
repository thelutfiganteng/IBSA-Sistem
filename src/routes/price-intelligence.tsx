import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMounted } from "@/hooks/use-mounted";
import { store } from "@/lib/storage";
import { buildSnapshots, buildVolatilitySeries, buildPriceSeries, type PriceSnapshot } from "@/lib/price-intel";
import { COMMODITIES, MARKETS, REGIONS } from "@/lib/seed";
import { useIntelligenceMemo } from "@/lib/intelligence-store";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Flame,
  Radio,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
  ReferenceLine,
} from "recharts";

export const Route = createFileRoute("/price-intelligence")({ component: Page });

function Page() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

const RISK_COLOR = { Low: "bg-supply text-white", Medium: "bg-amber-500 text-white", High: "bg-deficit text-white" } as const;

function Inner() {
  const mounted = useMounted();
  const [tick, setTick] = useState(0);
  const [selectedCom, setSelectedCom] = useState<string>("cabai");
  const [selectedMarket, setSelectedMarket] = useState<string>("km5");

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 6000);
    return () => clearInterval(id);
  }, []);

  const snapshot = useIntelligenceMemo(mounted, tick);
  const regionMetric = useMemo(() => {
    if (!snapshot) return null;
    const regionId = MARKETS.find((m) => m.id === selectedMarket)?.region;
    return snapshot.metrics.find((m) => m.regionId === regionId) ?? null;
  }, [snapshot, selectedMarket]);

  const weighs = mounted ? store.weighs.get() : [];
  const snapshots: PriceSnapshot[] = useMemo(() => buildSnapshots(weighs), [weighs, tick]);
  const volSeries = useMemo(() => buildVolatilitySeries(weighs), [weighs, tick]);

  const emergencyAlerts = useMemo(() => {
    if (!mounted) return [];
    const alerts: {
      pasarId: string;
      pasarName: string;
      komoditasId: string;
      komoditasName: string;
      limitType: "HAP" | "HET";
      limitPrice: number;
      currentPrices: number[];
      avgExceed: number;
      consecutiveDays: number;
    }[] = [];

    MARKETS.forEach((m) => {
      COMMODITIES.forEach((c) => {
        // Ambil data harga 5 hari terakhir untuk cek 3 hari berturut-turut
        const series = buildPriceSeries(weighs, c.id, m.id, 5);
        if (series.length >= 3) {
          const last3 = series.slice(-3);
          const allExceed = last3.every((p) => p.price > c.limitPrice);
          if (allExceed) {
            const prices = last3.map((p) => p.price);
            alerts.push({
              pasarId: m.id,
              pasarName: m.name,
              komoditasId: c.id,
              komoditasName: c.name,
              limitType: c.limitType,
              limitPrice: c.limitPrice,
              currentPrices: prices,
              avgExceed: Math.round(prices.reduce((s, x) => s + x, 0) / 3),
              consecutiveDays: 3,
            });
          }
        }
      });
    });
    return alerts;
  }, [weighs, tick, mounted]);

  const todaySnaps = snapshots;
  const abnormalCount = todaySnaps.filter((s) => s.anomalyStatus === "abnormal").length;
  const highRisk = todaySnaps.filter((s) => s.risk === "High").length;

  // For price cards: aggregate price per commodity (average across markets)
  const commodityCards = COMMODITIES.map((c) => {
    const rel = todaySnaps.filter((s) => s.komoditasId === c.id);
    const avg = rel.reduce((s, r) => s + r.harga, 0) / Math.max(rel.length, 1);
    const change = rel.reduce((s, r) => s + r.perubahanPct, 0) / Math.max(rel.length, 1);
    const vol = rel.reduce((s, r) => s + r.volatilityScore, 0) / Math.max(rel.length, 1);
    return { c, avg, change, vol };
  });

  // Comparison data per market for selected commodity
  const comparison = todaySnaps
    .filter((s) => s.komoditasId === selectedCom)
    .map((s) => ({ name: s.pasarName.replace("Pasar ", ""), harga: s.harga, risk: s.risk }))
    .sort((a, b) => b.harga - a.harga);

  // Volatility series for selected market+com
  const selVol = volSeries.find(
    (v) => v.komoditasId === selectedCom && v.pasarId === selectedMarket,
  );

  // AI detection messages
  const aiDetections = todaySnaps
    .filter((s) => Math.abs(s.perubahanPct) > 10 || s.volatilityScore > 0.6)
    .slice(0, 6)
    .map((s) => ({
      level: s.risk,
      text:
        Math.abs(s.perubahanPct) > 10
          ? `Anomali ${s.perubahanPct >= 0 ? "kenaikan" : "penurunan"} harga ${s.komoditasName} sebesar ${s.perubahanPct.toFixed(1)}% dalam 24 jam di ${s.pasarName}.`
          : `Volatilitas tinggi terdeteksi pada ${s.komoditasName} di ${s.pasarName} selama 3 hari terakhir.`,
    }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Radio className="h-6 w-6 text-primary" /> Real-Time Price Intelligence
          </h2>
          <p className="text-sm text-muted-foreground">
            Monitoring harga pangan dari 6 pasar induk Sumatera Selatan • Update {new Date().toLocaleTimeString("id-ID")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-supply text-white animate-pulse">
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-white" /> LIVE
          </Badge>
          <Badge variant="outline">{snapshots.length} feed harga</Badge>
        </div>
      </div>

      {/* Price cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {commodityCards.map(({ c, avg, change, vol }) => {
          const up = change >= 0;
          return (
            <Card key={c.id} className="relative overflow-hidden">
              <div
                className={`absolute inset-x-0 top-0 h-1 ${up ? "bg-deficit" : "bg-supply"}`}
              />
              <CardContent className="p-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-2xl">{c.icon}</span>
                  <Badge variant="outline" className={up ? "text-deficit" : "text-supply"}>
                    {up ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                    {change >= 0 ? "+" : ""}{change.toFixed(1)}%
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">{c.name}</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  Rp{Math.round(avg).toLocaleString("id-ID")}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Volatilitas: <span className="font-medium">{(vol * 100).toFixed(0)}%</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary signals */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SignalCard
          title="Abnormal Price Detected"
          value={abnormalCount}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="warning"
        />
        <SignalCard
          title="High Inflation Risk"
          value={highRisk}
          icon={<Flame className="h-5 w-5" />}
          tone="danger"
        />
        <SignalCard
          title="Total Monitored Feeds"
          value={snapshots.length}
          icon={<Activity className="h-5 w-5" />}
          tone="info"
        />
      </div>

      {/* RED ALERT - PEMICU DARURAT OPERASI PASAR (3 hari berturut-turut melampaui HAP/HET) */}
      {emergencyAlerts.length > 0 && (
        <Card className="border-red-500/40 bg-gradient-to-br from-red-500/10 via-background to-background">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-500 font-bold">
              <Flame className="h-5 w-5 animate-bounce" />
              Sinyal Darurat Operasi Pasar (Red Alert Bapanas)
              <Badge className="ml-auto bg-red-600 text-white animate-pulse">
                {emergencyAlerts.length} Wilayah Kritis
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Komoditas berikut terdeteksi melampaui Harga Acuan Penjualan (HAP) atau Harga Eceran Tertinggi (HET) selama <b>3 hari berturut-turut</b>. Direkomendasikan intervensi Operasi Pasar mendesak oleh TPID dan Bulog.
            </p>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {emergencyAlerts.map((a) => (
                <div
                  key={`${a.pasarId}-${a.komoditasId}`}
                  className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 shadow-sm relative overflow-hidden group hover:scale-[1.02] transition"
                >
                  <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-red-500 animate-ping" />
                  <div className="text-[10px] font-bold text-red-500 uppercase tracking-widest">
                    CRITICAL · CONSECUTIVE BREACH
                  </div>
                  <div className="mt-1 font-semibold text-foreground text-sm">
                    {a.komoditasName} @ {a.pasarName}
                  </div>
                  
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[10px]">BATAS {a.limitType}</span>
                      <span className="font-bold text-foreground">Rp{a.limitPrice.toLocaleString("id-ID")}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px]">RATA-RATA RIIL (3D)</span>
                      <span className="font-bold text-red-500">Rp{a.avgExceed.toLocaleString("id-ID")}</span>
                    </div>
                  </div>

                  <div className="mt-2 text-[10px] text-muted-foreground">
                    Tren: {a.currentPrices.map((p, idx) => (
                      <span key={idx} className="font-mono font-medium text-red-400">
                        Rp{p.toLocaleString("id-ID")}{idx < 2 ? " → " : ""}
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <Badge variant="outline" className="border-red-500/30 text-red-400 text-[9px]">
                      Selisih: +{Math.round(((a.avgExceed - a.limitPrice) / a.limitPrice) * 100)}%
                    </Badge>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-6 text-[10px] px-2 py-0"
                      onClick={() => {
                        toast.success(`Draf Surat Keputusan Operasi Pasar untuk ${a.komoditasName} di ${a.pasarName} berhasil diterbitkan (Sesuai Pedoman TPID/Bapanas).`);
                      }}
                    >
                      Draft Intervensi
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Detection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" /> AI Smart Detection Engine
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {aiDetections.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada anomali signifikan terdeteksi.</p>
          ) : (
            aiDetections.map((d, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm"
              >
                <Badge className={RISK_COLOR[d.level]}>{d.level}</Badge>
                <span className="flex-1">{d.text}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Regional Comparison */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Perbandingan Harga Antar Pasar</CardTitle>
          <div className="flex gap-2">
            {COMMODITIES.map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant={selectedCom === c.id ? "default" : "outline"}
                onClick={() => setSelectedCom(c.id)}
              >
                {c.icon} {c.name}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={comparison}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => `Rp${v.toLocaleString("id-ID")}`} />
              <Bar dataKey="harga" radius={[6, 6, 0, 0]}>
                {comparison.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.risk === "High" ? "#dc2626" : entry.risk === "Medium" ? "#f59e0b" : "#0ea5e9"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {comparison[0] && (
            <p className="mt-2 text-sm text-muted-foreground">
              <Flame className="mr-1 inline h-4 w-4 text-deficit" />
              <b>{comparison[0].name}</b> memiliki harga {COMMODITIES.find((c) => c.id === selectedCom)?.name} tertinggi di Sumsel (Rp{comparison[0].harga.toLocaleString("id-ID")}).
            </p>
          )}
        </CardContent>
      </Card>

      {/* Volatility */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Price Volatility Analytics</CardTitle>
          <select
            className="rounded-md border bg-background px-2 py-1 text-sm"
            value={selectedMarket}
            onChange={(e) => setSelectedMarket(e.target.value)}
          >
            {MARKETS.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={selVol?.points ?? []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="date" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => `Rp${v.toLocaleString("id-ID")}`} />
              <Legend />
              <ReferenceLine
                y={COMMODITIES.find((c) => c.id === selectedCom)?.limitPrice}
                stroke="#dc2626"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                label={{
                  value: `${COMMODITIES.find((c) => c.id === selectedCom)?.limitType} (Rp${COMMODITIES.find((c) => c.id === selectedCom)?.limitPrice.toLocaleString("id-ID")})`,
                  fill: "#dc2626",
                  position: "top",
                  fontSize: 10,
                  fontWeight: "bold",
                }}
              />
              <Line type="monotone" dataKey="price" stroke="#1d4ed8" strokeWidth={2} name="Harga" dot={{ r: 3 }} />
              <Line type="monotone" dataKey="ma" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" name="Moving Avg" dot={false} />
            </LineChart>
          </ResponsiveContainer>
          {selVol && selVol.spikes.length > 0 && (
            <div className="mt-3 rounded-lg border-l-4 border-amber-500 bg-amber-500/10 p-3 text-sm">
              <b>AI Spike Detection:</b> Terdeteksi {selVol.spikes.length} lonjakan signifikan dalam 21 hari terakhir. Volatilitas market: {(selVol.volatility * 100).toFixed(1)}%.
            </div>
          )}

          {regionMetric && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 border-t pt-4 text-xs font-semibold">
              <div className="rounded-lg border bg-muted/20 p-3">
                <span className="text-[10px] text-muted-foreground uppercase block mb-1">Volatilitas Regional (AI Engine)</span>
                <span className="text-sm font-bold text-foreground">{regionMetric.volatility}%</span>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <span className="text-[10px] text-muted-foreground uppercase block mb-1">Batas Anomali Statis (2σ)</span>
                <span className="text-sm font-bold text-foreground">
                  Rp{regionMetric.anomalyLowerBound.toLocaleString("id-ID")} - Rp{regionMetric.anomalyUpperBound.toLocaleString("id-ID")}
                </span>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <span className="text-[10px] text-muted-foreground uppercase block mb-1">Status Deteksi Anomali</span>
                <span className={`text-sm font-bold flex items-center gap-1.5 ${
                  regionMetric.isAnomaly ? "text-red-500 animate-pulse" : "text-emerald-500"
                }`}>
                  {regionMetric.isAnomaly ? "⚠️ Anomali Terdeteksi" : "🟢 Normal"}
                </span>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <span className="text-[10px] text-muted-foreground uppercase block mb-1">Moving Average 7 Hari</span>
                <span className="text-sm font-bold text-blue-500">Rp{regionMetric.movingAverage7d.toLocaleString("id-ID")}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily comparison table */}
      <Card>
        <CardHeader>
          <CardTitle>Tabel Harga Harian per Pasar</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Pasar</th>
                <th className="py-2 pr-3">Kode SDI (Kemendagri)</th>
                <th className="py-2 pr-3">Komoditas</th>
                <th className="py-2 pr-3 text-right">Harga</th>
                <th className="py-2 pr-3 text-right">Perubahan</th>
                <th className="py-2 pr-3 text-right">Supply</th>
                <th className="py-2 pr-3">Risk</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.slice(0, 24).map((s) => {
                const marketObj = MARKETS.find((m) => m.id === s.pasarId);
                const regionObj = REGIONS.find((r) => r.id === marketObj?.region);
                return (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 pr-3">{s.pasarName}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{regionObj?.kemendagriCode ?? "—"}</td>
                    <td className="py-2 pr-3">{s.komoditasName}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">Rp{s.harga.toLocaleString("id-ID")}</td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${s.perubahanPct >= 0 ? "text-deficit" : "text-supply"}`}>
                      {s.perubahanPct >= 0 ? "+" : ""}{s.perubahanPct.toFixed(1)}%
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{s.supply} kg</td>
                    <td className="py-2 pr-3"><Badge className={RISK_COLOR[s.risk]}>{s.risk}</Badge></td>
                    <td className="py-2 pr-3">
                      {s.anomalyStatus === "abnormal" ? (
                        <span className="text-deficit">⚠ Abnormal</span>
                      ) : (
                        <span className="text-supply">✓ Normal</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function SignalCard({
  title,
  value,
  icon,
  tone,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  tone: "info" | "warning" | "danger";
}) {
  const map = {
    info: "from-primary/10 to-primary/5 text-primary",
    warning: "from-amber-500/15 to-amber-500/5 text-amber-600",
    danger: "from-deficit/15 to-deficit/5 text-deficit",
  } as const;
  return (
    <Card className={`bg-gradient-to-br ${map[tone]}`}>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="grid h-12 w-12 place-items-center rounded-lg bg-background/60">{icon}</div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
          <div className="text-3xl font-bold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
