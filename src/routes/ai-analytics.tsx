import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMounted } from "@/hooks/use-mounted";
import { store } from "@/lib/storage";
import { applyClusters, computeRegionMetrics } from "@/lib/kmeans";
import { generateInsights, generateRecommendations } from "@/lib/ai";
import { REGIONS } from "@/lib/seed";
import { AlertTriangle, Brain, Lightbulb, Sparkles, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/ai-analytics")({ component: AiAnalyticsPage });

function AiAnalyticsPage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

const ICON: Record<string, any> = {
  summary: Sparkles,
  alert: AlertTriangle,
  recommendation: Lightbulb,
  prediction: TrendingUp,
};

function Inner() {
  const mounted = useMounted();
  const data = useMemo(() => {
    if (!mounted) return null;
    const w = store.weighs.get();
    const m = applyClusters(computeRegionMetrics(w));
    return {
      insights: generateInsights(m, w),
      recs: generateRecommendations(m),
      metrics: m,
    };
  }, [mounted]);

  if (!data) return <div className="text-muted-foreground">Memuat…</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-analytics" /> AI Insight Generator
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {data.insights.map((ins, i) => {
            const Icon = ICON[ins.type] ?? Sparkles;
            const sev: Record<string, string> = {
              info: "border-l-analytics bg-analytics/5",
              warning: "border-l-warning bg-warning/5",
              danger: "border-l-deficit bg-deficit/5",
            };
            return (
              <div
                key={i}
                className={`rounded-lg border border-l-4 p-4 ${sev[ins.severity]}`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <div className="font-semibold">{ins.title}</div>
                  <Badge variant="outline" className="ml-auto text-xs">
                    {ins.type}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{ins.message}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>AI Prediksi Inflasi Pangan per Wilayah</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.metrics
              .slice()
              .sort((a, b) => {
                const order = { High: 0, Medium: 1, Low: 2 } as any;
                return order[a.inflationRisk!] - order[b.inflationRisk!];
              })
              .map((m) => {
                const r = REGIONS.find((x) => x.id === m.regionId);
                return (
                  <div
                    key={m.regionId}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <div className="font-medium">{r?.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Supply {m.totalSupply}kg · Demand {m.totalDemand}kg
                      </div>
                    </div>
                    <Badge
                      className={
                        m.inflationRisk === "High"
                          ? "bg-deficit text-white"
                          : m.inflationRisk === "Medium"
                            ? "bg-warning text-white"
                            : "bg-supply text-white"
                      }
                    >
                      {m.inflationRisk} Risk
                    </Badge>
                  </div>
                );
              })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Recommendation Engine</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recs.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Tidak ada rekomendasi prioritas saat ini.
              </p>
            )}
            {data.recs.map((r) => (
              <div key={r.id} className="rounded-lg border p-3">
                <div className="mb-1 flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-warning" />
                  <span className="font-medium text-sm">Prioritas {r.priority.toUpperCase()}</span>
                </div>
                <p className="text-sm">{r.reason}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
