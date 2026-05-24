import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMounted } from "@/hooks/use-mounted";
import { store } from "@/lib/storage";
import { detectAnomalies, summarizeAnomalies, type Anomaly } from "@/lib/price-intel";
import {
  AlertOctagon,
  AlertTriangle,
  Brain,
  Eye,
  Flame,
  ScanLine,
  ShieldAlert,
  Sparkles,
  TrendingDown,
} from "lucide-react";

export const Route = createFileRoute("/anomaly-detection")({ component: Page });

function Page() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

const KIND_META: Record<Anomaly["jenis"], { label: string; icon: any; color: string }> = {
  "harga-lonjakan": { label: "Lonjakan Harga", icon: Flame, color: "text-deficit" },
  "harga-manipulatif": { label: "Harga Manipulatif", icon: ShieldAlert, color: "text-amber-600" },
  "supply-turun": { label: "Supply Turun Drastis", icon: TrendingDown, color: "text-orange-600" },
  "timbangan-ekstrem": { label: "Timbangan Tidak Wajar", icon: AlertOctagon, color: "text-rose-600" },
  "input-duplikat": { label: "Input Duplikat", icon: Eye, color: "text-blue-600" },
};

const SEV_BADGE = {
  high: "bg-deficit text-white",
  medium: "bg-amber-500 text-white",
  low: "bg-supply text-white",
} as const;

function Inner() {
  const mounted = useMounted();
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<"all" | Anomaly["severity"]>("all");

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 8000);
    return () => clearInterval(id);
  }, []);

  const weighs = mounted ? store.weighs.get() : [];
  const anomalies = useMemo(() => detectAnomalies(weighs), [weighs, tick]);
  const summary = useMemo(() => summarizeAnomalies(anomalies), [anomalies]);

  const filtered =
    filter === "all" ? anomalies : anomalies.filter((a) => a.severity === filter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border bg-gradient-to-r from-primary/10 via-background to-deficit/10 p-6">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg">
            <Brain className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">AI Anomaly Detection</h2>
            <p className="text-sm text-muted-foreground">
              AI Monitoring Center • Auto-scanning supply, harga, dan timbangan dari seluruh pasar induk Sumsel
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge className="bg-supply text-white animate-pulse">
              <ScanLine className="mr-1 h-3 w-3" /> AI SCANNING
            </Badge>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatBox title="Total Anomaly Today" value={summary.total} icon={<Sparkles />} tone="primary" />
        <StatBox title="High Risk" value={summary.high} icon={<Flame />} tone="danger" />
        <StatBox title="Medium Risk" value={summary.medium} icon={<AlertTriangle />} tone="warning" />
        <StatBox title="Low Risk" value={summary.low} icon={<Eye />} tone="info" />
      </div>

      {/* Highlight cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="border-deficit/40 bg-deficit/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-deficit">
              <Flame className="h-5 w-5" /> High Risk Market
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary.topMarket ? (
              <>
                <div className="text-2xl font-bold">{summary.topMarket.pasarName}</div>
                <p className="text-sm text-muted-foreground">
                  {summary.topMarket.count} anomali terdeteksi dalam 24 jam terakhir.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Tidak ada pasar dengan anomali signifikan.</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" /> Most Unstable Commodity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary.topCommodity ? (
              <>
                <div className="text-2xl font-bold">{summary.topCommodity.komoditasName}</div>
                <p className="text-sm text-muted-foreground">
                  {summary.topCommodity.count} anomali terdeteksi pada komoditas ini.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Semua komoditas dalam kondisi stabil.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(["all", "high", "medium", "low"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md border px-3 py-1.5 text-sm transition ${
              filter === f ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            {f === "all" ? "Semua" : f.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Alerts feed */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" /> AI Warning System
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-lg border bg-supply/10 p-6 text-center text-sm text-muted-foreground">
              <Sparkles className="mx-auto mb-2 h-8 w-8 text-supply" />
              Tidak ada anomali untuk filter ini. Sistem dalam kondisi normal.
            </div>
          ) : (
            filtered.map((a) => {
              const meta = KIND_META[a.jenis];
              const Icon = meta.icon;
              return (
                <div
                  key={a.id}
                  className="flex flex-col gap-3 rounded-xl border bg-card p-4 transition hover:shadow-md md:flex-row md:items-start"
                >
                  <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-muted ${meta.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={SEV_BADGE[a.severity]}>{a.severity.toUpperCase()}</Badge>
                      <Badge variant="outline">{meta.label}</Badge>
                      <span className="text-xs text-muted-foreground">{a.pasarName}</span>
                    </div>
                    <p className="text-sm font-medium">{a.message}</p>
                    <p className="text-xs text-muted-foreground">
                      <Sparkles className="mr-1 inline h-3 w-3" />
                      Rekomendasi: {a.recommendation}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 md:flex-col md:items-end">
                    <div className="text-right">
                      <div className="text-[10px] uppercase text-muted-foreground">AI Confidence</div>
                      <div className="text-lg font-bold tabular-nums text-primary">
                        {(a.confidence * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${a.confidence * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatBox({
  title,
  value,
  icon,
  tone,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  tone: "primary" | "danger" | "warning" | "info";
}) {
  const map = {
    primary: "from-primary to-primary/70",
    danger: "from-deficit to-deficit/70",
    warning: "from-amber-500 to-amber-400",
    info: "from-supply to-supply/70",
  } as const;
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className={`bg-gradient-to-br ${map[tone]} p-4 text-white`}>
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase opacity-90">{title}</div>
            <div className="opacity-80">{icon}</div>
          </div>
          <div className="mt-2 text-3xl font-bold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
